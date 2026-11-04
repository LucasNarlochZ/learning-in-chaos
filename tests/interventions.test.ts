import { describe, expect, it } from 'vitest';
import {
  addHypothesis,
  advance,
  createRun,
  explainQuery,
  inspectSessions,
  intervene,
  observe,
  replay,
  report,
} from '../packages/sim-engine/src';
import { availableActions } from '../packages/educational-content/src';

describe('additional interventions', () => {
  it('builds an index after the delay, preserving catalog ordering and replay', () => {
    const run = createRun(42, 'guided');
    const sql = explainQuery(run, 'GET /products', 'catalog-list').sql;
    intervene(run, 'create-index');
    advance(run, 299);
    expect(explainQuery(run, 'GET /products', 'catalog-list').text).toContain('Seq Scan');
    advance(run, 121);
    expect(run.status).toBe('resolved');
    expect(explainQuery(run, 'GET /products', 'catalog-list').sql).toBe(sql);
    expect(explainQuery(run, 'GET /products', 'catalog-list').text).toContain(
      'products_created_at_idx',
    );
    expect(replay(run.record)).toEqual(run);
  });

  it('scales the primary database and charges for capacity without repairing the query', () => {
    const run = createRun(1, 'guided');
    intervene(run, 'scale-db');
    advance(run, 299);
    expect(observe(run).topology.databaseCapacity).toBe(1100);
    advance(run, 121);
    expect(run.status).toBe('resolved');
    expect(report(run).repaired).toBe(false);
    expect(run.metrics.hourlyCost).toBeCloseTo(0.52);
    expect(observe(run).topology.databaseCapacity).toBe(2200);
    expect(explainQuery(run, 'GET /products', 'catalog-list').text).toContain('Seq Scan');
    expect(replay(run.record)).toEqual(run);
  });

  it('keeps the rolled-back query when an index is created afterwards', () => {
    const run = createRun(42, 'guided');
    intervene(run, 'rollback');
    advance(run, 180);
    const rolledBack = explainQuery(run, 'GET /products', 'catalog-list');
    intervene(run, 'create-index');
    advance(run, 300);
    expect(explainQuery(run, 'GET /products', 'catalog-list').sql).toBe(rolledBack.sql);
    expect(explainQuery(run, 'GET /products', 'catalog-list').text).toContain('products_pkey');
  });

  it('limits lock wait duration and occupied connections while failed checkouts persist', () => {
    const run = createRun(42, 'guided', 'mercado-02');
    addHypothesis(run, 'Verificar sessões e esperas do banco.');
    inspectSessions(run);
    const before = observe(run);
    intervene(run, 'lock-timeout');
    advance(run, 60);
    const after = observe(run);
    expect(after.endpoints.find((e) => e.path === 'POST /checkout')!.latency).toBe(1180);
    expect(after.metrics.connections).toBeLessThan(before.metrics.connections);
    expect(after.metrics.errorRate).toBeGreaterThan(1);
    expect(after.databaseSessions!.find((s) => s.pid === 842)!.transactionAge).toBe(1);
    expect(run.status).toBe('active');
    expect(replay(run.record)).toEqual(run);
  });

  it('expires an idle transaction only when the configured threshold is reached', () => {
    const run = createRun(42, 'guided', 'mercado-02');
    addHypothesis(run, 'Verificar sessões e esperas do banco.');
    inspectSessions(run);
    intervene(run, 'idle-timeout');
    advance(run, 89);
    expect(observe(run).databaseSessions!.some((s) => s.pid === 731)).toBe(true);
    advance(run, 1);
    expect(observe(run).databaseSessions!.some((s) => s.pid === 731)).toBe(false);
    expect(
      run.logs.some((log) => log.message.includes('idle_in_transaction_session_timeout')),
    ).toBe(true);
    advance(run, 60);
    expect(run.status).toBe('resolved');
    expect(replay(run.record)).toEqual(run);
  });

  it.each(['scale-db', 'create-index', 'lock-timeout'] as const)(
    '%s cannot remove an external row lock',
    (action) => {
      const run = createRun(42, 'guided', 'mercado-02');
      intervene(run, action);
      advance(run, 600);
      expect(run.status).toBe('active');
      expect(report(run).repaired).toBe(false);
    },
  );

  it.each(['lock-timeout', 'idle-timeout'] as const)(
    '%s cannot repair an expensive query',
    (action) => {
      const run = createRun(42, 'guided');
      intervene(run, action);
      advance(run, 600);
      expect(run.status).toBe('active');
      expect(report(run).repaired).toBe(false);
    },
  );

  it('offers the new tools in both investigation modes and rejects repeated application', () => {
    for (const mode of ['guided', 'free'] as const) {
      expect(availableActions(mode).map((a) => a.id)).toEqual(
        expect.arrayContaining([
          'create-index',
          mode === 'free' ? 'scale-api' : 'scale-db',
          'lock-timeout',
          'idle-timeout',
        ]),
      );
    }
    const run = createRun(42, 'guided');
    intervene(run, 'lock-timeout');
    advance(run, 60);
    expect(() => intervene(run, 'lock-timeout')).toThrow();
  });
});
