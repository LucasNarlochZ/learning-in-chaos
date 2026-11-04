import { describe, expect, it } from 'vitest';
import {
  addHypothesis,
  configureInstrumentation,
  advance,
  createRun,
  explainQuery,
  inspectSessions,
  intervene,
  observe,
  replay,
  report,
  restoreRun,
} from '../packages/sim-engine/src';
import { EngineSession } from '../apps/web/src/session';

const hard = (seed = 42) => createRun(seed, 'guided', 'mercado-02');

describe('second incident: misleading correlations and row locks', () => {
  it('shows healthy indexed queries and low database usage despite checkout failures', () => {
    const run = hard();
    const view = observe(run);
    expect(run.record.scenarioId).toBe('mercado-02');
    expect(view.metrics.databaseUtilization).toBeLessThan(50);
    expect(view.metrics.latency).toBeGreaterThan(800);
    expect(view.metrics.errorRate).toBeGreaterThan(1);
    expect(view.endpoints.find((e) => e.path === 'GET /products')!.latency).toBeLessThan(800);
    expect(explainQuery(run, 'POST /checkout', 'checkout-stock').text).toContain('Index Scan');
    expect(view.events.some((e) => e.kind === 'deploy')).toBe(true);
    expect(
      view.logs.some(
        (e) => e.message.includes('SeqScan') && e.message.includes('rows_examined=48'),
      ),
    ).toBe(true);
    expect(view).not.toHaveProperty('rootCause');
  });

  it('exposes a consistent blocker chain and increasing transaction age as evidence', () => {
    const run = hard();
    addHypothesis(run, 'Verificar se há uma transação mantendo conexões em espera.');
    inspectSessions(run);
    const initial = observe(run).databaseSessions!;
    const blocker = initial.find((s) => s.pid === 731)!;
    expect(blocker.state).toBe('idle in transaction');
    expect(initial.find((s) => s.blockedBy === blocker.pid)?.waitEvent).toBe('Lock: transactionid');
    advance(run, 30);
    expect(observe(run).databaseSessions!.find((s) => s.pid === 731)!.transactionAge).toBe(
      blocker.transactionAge + 30,
    );
    expect(replay(run.record)).toEqual(run);
  });

  it.each([
    'rollback',
    'optimize-query',
    'cache',
    'replica',
    'scale-api',
    'pool',
    'restart',
  ] as const)('%s does not remove an external transaction lock', (action) => {
    const run = createRun(42, 'free', 'mercado-02');
    const target = (
      {
        'optimize-query': 'catalog-list',
        cache: 'GET /products',
        'scale-api': 'api',
        restart: 'api-1',
      } as Partial<Record<typeof action, string>>
    )[action];
    intervene(run, action, undefined, target);
    advance(run, 600);
    expect(run.status).toBe('active');
    expect(run.metrics.errorRate).toBeGreaterThan(1);
    expect(report(run).repaired).toBe(false);
  });

  it('recovers after stopping the import, respecting its delay and stability window', () => {
    for (const seed of [0, 42, 4294967295]) {
      for (const mode of ['guided', 'free'] as const) {
        const run = createRun(seed, mode, 'mercado-02');
        if (mode === 'free') {
          configureInstrumentation(run, 'database-sessions', true);
          advance(run, 60);
        }
        addHypothesis(run, 'Verificar sessões e esperas do banco.');
        inspectSessions(run);
        intervene(run, 'stop-import', undefined, mode === 'free' ? 'inventory-sync' : undefined);
        advance(run, 119);
        expect(run.status).toBe('active');
        expect(observe(run).databaseSessions!.some((s) => s.pid === 731)).toBe(true);
        advance(run, 61);
        expect(run.status).toBe('resolved');
        expect(observe(run).databaseSessions!.some((s) => s.blockedBy !== null)).toBe(false);
        expect(report(run).rootCause).toContain('transação');
        expect(restoreRun(JSON.stringify(run.record))).toEqual(run);
      }
    }
  });

  it('preserves the selected incident across worker commands and restore without revealing the report', () => {
    const session = new EngineSession();
    const first = session.execute({
      type: 'start',
      seed: 42,
      difficulty: 'guided',
      scenarioId: 'mercado-02',
    });
    expect(first.report).toBeNull();
    expect(
      session.execute({ type: 'restore', json: JSON.stringify(first.record) }).record.scenarioId,
    ).toBe('mercado-02');
    expect(() => createRun(42, 'free', 'unknown')).toThrow();
    expect(() => intervene(createRun(), 'stop-import')).toThrow();
  });
});
