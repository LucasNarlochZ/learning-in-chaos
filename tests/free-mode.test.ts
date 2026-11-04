import { describe, expect, it } from 'vitest';
import { EngineSession, type Command } from '../apps/web/src/session';
import { observe, replay } from '../packages/sim-engine/src';

function start(scenarioId = 'mercado-02') {
  const session = new EngineSession();
  session.execute({ type: 'start', seed: 42, difficulty: 'free', scenarioId });
  return session;
}

function instrument(session: EngineSession, metric: string, enabled = true) {
  session.execute({ type: 'instrumentation', metric, enabled } as Command);
  return session.execute({ type: 'tick', seconds: enabled ? 60 : 0 });
}

function apply(session: EngineSession, action: string, target?: string, seconds = 300) {
  session.execute({ type: 'action', action, target } as Command);
  return session.execute({ type: 'tick', seconds });
}

describe('free exploration', () => {
  it('withholds optional telemetry at the engine boundary until installation finishes', () => {
    const session = start();
    const initial = session.execute({ type: 'tick', seconds: 0 });
    expect(initial.observation.database).toBeNull();
    expect(initial.observation.checkoutBreakdown).toEqual([]);
    expect(initial.observation.databaseSessions).toBeNull();
    expect(
      initial.observation.logs.some((log) =>
        /idle_in_transaction|wait_event|sku=|plan=/.test(log.message),
      ),
    ).toBe(false);
    expect(() =>
      session.execute({ type: 'query-plan', endpoint: 'GET /products', queryId: 'catalog-list' }),
    ).toThrow(/instrumentação/i);
    expect(() => session.execute({ type: 'inspect-sessions' })).toThrow(/instrumentação/i);
    session.execute({
      type: 'instrumentation',
      metric: 'database-sessions',
      enabled: true,
    } as Command);
    expect(session.execute({ type: 'tick', seconds: 59 }).observation.database).toBeNull();
    const ready = session.execute({ type: 'tick', seconds: 1 });
    expect(ready.observation.database?.idleInTransaction).toBe(1);
    expect(session.execute({ type: 'inspect-sessions' }).observation.databaseSessions).toHaveLength(
      3,
    );
    expect(observe(replay(ready.record))).toEqual(ready.observation);
  });

  it('charges additive measurable telemetry overhead and releases it when disabled', () => {
    const session = start();
    const base = session.execute({ type: 'tick', seconds: 0 }).observation.metrics;
    const first = instrument(session, 'database-sessions');
    const second = instrument(session, 'checkout-dimensions');
    expect(first.observation.metrics.hourlyCost).toBeGreaterThan(base.hourlyCost);
    expect(second.observation.metrics.hourlyCost).toBeGreaterThan(
      first.observation.metrics.hourlyCost,
    );
    expect(second.observation.metrics.latency).toBeGreaterThan(first.observation.metrics.latency);
    expect(second.observation.metrics.databaseUtilization).toBeGreaterThan(
      first.observation.metrics.databaseUtilization,
    );
    expect(second.observation.checkoutBreakdown).toHaveLength(4);
    expect(second.observation.instrumentation.overhead.databaseWork).toBeGreaterThan(
      first.observation.instrumentation.overhead.databaseWork,
    );
    const disabled = instrument(session, 'database-sessions', false);
    expect(disabled.observation.database).toBeNull();
    expect(disabled.observation.databaseSessions).toBeNull();
    expect(disabled.observation.metrics.hourlyCost).toBeLessThan(
      second.observation.metrics.hourlyCost,
    );
    expect(observe(replay(disabled.record))).toEqual(disabled.observation);
  });

  it('collects detailed logs only while enabled and gates plans independently', () => {
    const session = start();
    const installed = instrument(session, 'detailed-logs');
    expect(
      installed.observation.logs
        .filter((log) => log.at < 60)
        .some((log) => /sku=|wait_event|idle_in_transaction/.test(log.message)),
    ).toBe(false);
    expect(
      session
        .execute({ type: 'tick', seconds: 10 })
        .observation.logs.some((log) => log.at >= 60 && /sku=/.test(log.message)),
    ).toBe(true);
    instrument(session, 'query-plans');
    expect(
      session.execute({
        type: 'query-plan',
        endpoint: 'POST /checkout',
        queryId: 'checkout-pricing',
      }).queryPlan?.text,
    ).toContain('Seq Scan');
    const stopped = instrument(session, 'query-plans', false);
    expect(stopped.queryPlan).toBeNull();
    expect(() =>
      session.execute({
        type: 'query-plan',
        endpoint: 'POST /checkout',
        queryId: 'checkout-pricing',
      }),
    ).toThrow();
  });

  it('requires valid explicit targets without mutating a rejected decision', () => {
    const session = start();
    const initial = session.execute({ type: 'tick', seconds: 0 });
    for (const action of [
      'cache',
      'create-index',
      'scale-api',
      'restart',
      'stop-import',
      'optimize-query',
    ]) {
      expect(() => session.execute({ type: 'action', action } as Command)).toThrow(/alvo/i);
      expect(() =>
        session.execute({ type: 'action', action, target: 'unknown' } as Command),
      ).toThrow(/alvo/i);
    }
    expect(session.execute({ type: 'tick', seconds: 0 }).record).toEqual(initial.record);
  });

  it('allows caches on different endpoints with distinct work savings and cumulative costs', () => {
    const catalog = start();
    const checkout = start();
    const a = apply(catalog, 'cache', 'GET /products', 120);
    const b = apply(checkout, 'cache', 'POST /checkout', 120);
    expect(a.observation.metrics.databaseUtilization).toBeLessThan(
      b.observation.metrics.databaseUtilization,
    );
    expect(b.observation.metrics.errorRate).toBeCloseTo(8);
    const c = apply(catalog, 'cache', 'GET /orders', 120);
    expect(c.observation.metrics.hourlyCost).toBeGreaterThan(a.observation.metrics.hourlyCost);
    expect(() => apply(catalog, 'cache', 'GET /products')).toThrow(/aplicada/i);
    expect(observe(replay(c.record))).toEqual(c.observation);
  });

  it('indexes the selected query and preserves locks and unrelated query plans', () => {
    const session = start();
    instrument(session, 'query-plans');
    apply(session, 'create-index', 'checkout-pricing');
    const plan = session.execute({
      type: 'query-plan',
      endpoint: 'POST /checkout',
      queryId: 'checkout-pricing',
    });
    expect(plan.queryPlan?.text).toContain('price_rules_product_text_idx');
    expect(plan.queryPlan?.sql).toContain('product_id::text');
    expect(plan.observation.metrics.errorRate).toBeCloseTo(8);
    expect(plan.report).toBeNull();
    expect(observe(replay(plan.record))).toEqual(plan.observation);
  });

  it('scales the selected resource and rejects nodes that do not exist', () => {
    const api = start();
    const db = start();
    const a = apply(api, 'scale-api', 'api');
    const b = apply(db, 'scale-api', 'database');
    expect(a.observation.topology.apiInstances).toBe(2);
    expect(a.observation.topology.databaseCapacity).toBe(1100);
    expect(b.observation.topology.databaseCapacity).toBe(2200);
    expect(b.observation.topology.apiInstances).toBe(1);
    expect(() => apply(db, 'restart', 'replica')).toThrow(/alvo/i);
    expect(observe(replay(b.record))).toEqual(b.observation);
  });

  it('restarting the primary releases transactions with downtime and aborted work', () => {
    const session = start();
    session.execute({ type: 'action', action: 'restart', target: 'database' } as Command);
    const down = session.execute({ type: 'tick', seconds: 10 });
    expect(down.observation.metrics.errorRate).toBe(100);
    const up = session.execute({ type: 'tick', seconds: 50 });
    expect(up.observation.metrics.errorRate).toBe(0);
    expect(up.observation.abortedCheckouts).toBeGreaterThan(0);
    expect(observe(replay(up.record))).toEqual(up.observation);
  });

  it('stopping checkout processing causes persistent failures while stopping the import releases its lock', () => {
    const wrong = start();
    const right = start();
    const a = apply(wrong, 'stop-import', 'checkout-processing', 120);
    const b = apply(right, 'stop-import', 'inventory-sync', 120);
    expect(a.observation.metrics.errorRate).toBeGreaterThan(8);
    expect(a.observation.status).toBe('active');
    expect(b.observation.metrics.errorRate).toBe(0);
    expect(b.observation.abortedCheckouts).toBe(0);
    expect(observe(replay(a.record))).toEqual(a.observation);
  });

  it('restarts only the selected replica without interrupting checkout or losing the importer session', () => {
    const session = start();
    instrument(session, 'database-sessions');
    session.execute({ type: 'hypothesis', text: 'Verificar sessões antes de reiniciar um nó.' });
    session.execute({ type: 'inspect-sessions' });
    apply(session, 'replica');
    session.execute({ type: 'action', action: 'restart', target: 'replica' });
    const down = session.execute({ type: 'tick', seconds: 10 });
    expect(
      down.observation.endpoints.find((endpoint) => endpoint.path === 'GET /products')?.errorRate,
    ).toBe(50);
    expect(
      down.observation.endpoints.find((endpoint) => endpoint.path === 'POST /checkout')?.errorRate,
    ).toBe(40);
    expect(down.observation.databaseSessions?.some((session) => session.pid === 904)).toBe(true);
    expect(down.observation.databaseSessions?.some((session) => session.pid === 731)).toBe(true);
    expect(down.observation.database?.lockWaitMs).toBeGreaterThan(0);
    expect(down.observation.database?.activeConnections).toBeGreaterThan(25);
  });

  it('can resume a mistakenly stopped checkout operation without hiding the unresolved lock', () => {
    const session = start();
    apply(session, 'stop-import', 'checkout-processing', 120);
    const resumed = apply(session, 'resume-operation', 'checkout-processing', 60);
    expect(resumed.observation.metrics.errorRate).toBeCloseTo(8);
    expect(resumed.observation.topology.stoppedOperations).toEqual([]);
    expect(observe(replay(resumed.record))).toEqual(resumed.observation);
  });

  it('reports the actual intervention targets and their costs', () => {
    const session = start();
    apply(session, 'cache', 'GET /orders', 120);
    const ended = session.execute({ type: 'finish' });
    expect(ended.report?.risks.some((risk) => risk.name.includes('GET /orders'))).toBe(true);
    expect(ended.report?.risks.some((risk) => risk.name.includes('catálogo'))).toBe(false);
  });

  it('keeps optional instrumentation usable in the first incident', () => {
    const session = start('mercado-01');
    instrument(session, 'database-sessions');
    session.execute({
      type: 'hypothesis',
      text: 'Verificar conexões ativas e transações do banco.',
    });
    expect(() => session.execute({ type: 'inspect-sessions' })).not.toThrow();
  });
});
