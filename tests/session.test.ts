import { expect, it } from 'vitest';
import { EngineSession } from '../apps/web/src/session';

it('keeps the root cause out of active worker responses and reveals it after finishing', () => {
  const session = new EngineSession();
  const initial = session.execute({ type: 'start', seed: 42, difficulty: 'guided' });
  expect(initial.report).toBeNull();
  expect(JSON.stringify(initial)).not.toContain('coluna sem índice');
  const ended = session.execute({ type: 'finish' });
  expect(ended.report?.rootCause).toContain('coluna sem índice');
});

it('restores a run from the decision record, not saved metrics', () => {
  const session = new EngineSession();
  session.execute({ type: 'start', seed: 42, difficulty: 'guided' });
  session.execute({ type: 'hypothesis', text: 'Database work increased after the release.' });
  session.execute({ type: 'action', action: 'rollback' });
  const state = session.execute({ type: 'tick', seconds: 60 });
  const restored = new EngineSession().execute({ type: 'restore', json: JSON.stringify(state.record) });
  expect(restored).toEqual(state);
});

it('explains incompatible saved progress without exposing schema internals', () => {
  expect(() => new EngineSession().execute({ type: 'restore', json: '{"seed": 42}' }))
    .toThrow('O progresso salvo está danificado ou usa uma versão incompatível. Inicie uma nova investigação.');
});

it('fetches a plan for an endpoint without advancing time or recording a decision', () => {
  const session = new EngineSession();
  const initial = session.execute({ type: 'start', seed: 42, difficulty: 'guided' });
  expect(initial.observation.endpoints.every(endpoint => endpoint.queries.length > 0)).toBe(true);
  const result = session.execute({ type: 'query-plan', endpoint: 'GET /products', queryId: 'catalog-list' });
  expect(result.queryPlan?.text).toContain('Seq Scan on products');
  expect(result.queryPlan?.text).toContain('Sort Key: created_at DESC');
  expect(result.queryPlan?.sql).toContain('ORDER BY created_at DESC');
  expect(result.record).toEqual(initial.record);
  expect(result.observation).toEqual(initial.observation);
  expect(result.report).toBeNull();
});

it('fetches plans for unaffected endpoints and rejects mismatched queries', () => {
  const session = new EngineSession();
  session.execute({ type: 'start', seed: 42, difficulty: 'guided' });
  for (const [endpoint, queryId, relation] of [
    ['GET /products/:id', 'product-detail', 'products'],
    ['POST /checkout', 'checkout-stock', 'products'],
    ['GET /orders', 'customer-orders', 'orders'],
  ]) {
    const result = session.execute({ type: 'query-plan', endpoint, queryId });
    expect(result.queryPlan?.text).toContain(`Index Scan using ${relation}_`);
  }
  expect(() => session.execute({ type: 'query-plan', endpoint: 'GET /orders', queryId: 'catalog-list' })).toThrow('Consulta não encontrada para este endpoint.');
  expect(() => session.execute({ type: 'query-plan', endpoint: 'GET /unknown', queryId: 'catalog-list' })).toThrow('Consulta não encontrada para este endpoint.');
});

it.each(['rollback', 'optimize-query'] as const)('reflects %s only after it completes and keeps previous fetches timestamped', action => {
  const session = new EngineSession();
  session.execute({ type: 'start', seed: 42, difficulty: 'guided' });
  const before = session.execute({ type: 'query-plan', endpoint: 'GET /products', queryId: 'catalog-list' });
  session.execute({ type: 'action', action });
  session.execute({ type: 'tick', seconds: 30 });
  const pending = session.execute({ type: 'query-plan', endpoint: 'GET /products', queryId: 'catalog-list' });
  expect(pending.queryPlan?.text).toContain('Seq Scan');
  const completed = session.execute({ type: 'tick', seconds: 210 });
  expect(completed.queryPlan).toEqual(pending.queryPlan);
  const after = session.execute({ type: 'query-plan', endpoint: 'GET /products', queryId: 'catalog-list' });
  expect(after.queryPlan?.text).toContain('Index Scan Backward using products_pkey');
  expect(after.queryPlan?.sql).toContain('ORDER BY id DESC');
  expect(after.queryPlan?.at).toBe(240);
  expect(before.queryPlan?.at).toBe(0);
  expect(after.queryPlan!.workUnits).toBeLessThan(before.queryPlan!.workUnits);
});

it('cache changes do not change the underlying query plan, and a new run clears the fetched plan', () => {
  const session = new EngineSession();
  session.execute({ type: 'start', seed: 42, difficulty: 'guided' });
  session.execute({ type: 'action', action: 'cache' });
  session.execute({ type: 'tick', seconds: 150 });
  const fetched = session.execute({ type: 'query-plan', endpoint: 'GET /products', queryId: 'catalog-list' });
  expect(fetched.queryPlan?.text).toContain('Seq Scan');
  expect(session.execute({ type: 'start', seed: 42, difficulty: 'guided' }).queryPlan).toBeNull();
});
