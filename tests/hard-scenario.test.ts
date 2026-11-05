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
import { getScenario } from '../packages/scenarios/src';

const hard = (seed = 42) => createRun(seed, 'guided', 'mercado-02');

describe('second incident: misleading correlations and row locks', () => {
  it('defines the blocking import and locked rows as a simulated process', () => {
    const process = getScenario('mercado-02').processes?.find(
      (item) => item.id === 'inventory-sync',
    );
    expect(process).toMatchObject({
      pid: 731,
      locks: [{ table: 'products', rowKeys: ['SKU-101', 'SKU-102'] }],
    });
    const run = hard();
    inspectSessions(run);
    expect(observe(run).databaseSessions!.filter((session) => session.pid === 731)).toHaveLength(1);
    intervene(run, 'terminate-session', 731);
    advance(run, 30);
    expect(run.processes.find((item) => item.definition.id === 'inventory-sync')?.running).toBe(
      false,
    );
    expect(observe(run).checkoutBreakdown.every((segment) => segment.errorRate === 0)).toBe(true);
  });

  it('restores the lock and incident state when the stopped import is resumed', () => {
    const run = createRun(42, 'free', 'mercado-02');
    intervene(run, 'stop-import', undefined, 'inventory-sync');
    advance(run, 120);
    expect(run.system.regression).toBe(false);
    intervene(run, 'resume-operation', undefined, 'inventory-sync');
    advance(run, 60);
    expect(run.system.regression).toBe(true);
    expect(report(run).repaired).toBe(false);
  });

  it('derives the worker restart target from process configuration', () => {
    const scenario = getScenario('mercado-02');
    const process = scenario.processes![0];
    const original = process.worker;
    process.worker = { id: 'custom-worker', label: 'Custom worker' };
    try {
      const run = createRun(42, 'free', scenario.id);
      expect(observe(run).actionTargets.restart).toContainEqual({
        id: 'custom-worker',
        label: 'Custom worker',
      });
    } finally {
      process.worker = original;
    }
  });

  it('resolves a blocking process without depending on its operation ID', () => {
    const scenario = getScenario('mercado-02');
    const process = scenario.processes![0];
    const original = process.id;
    process.id = 'custom-import';
    try {
      const run = createRun(42, 'free', scenario.id);
      intervene(run, 'stop-import', undefined, 'custom-import');
      advance(run, 120);
      expect(run.system.regression).toBe(false);
      expect(observe(run).checkoutBreakdown.every((segment) => segment.errorRate === 0)).toBe(true);
    } finally {
      process.id = original;
    }
  });

  it('reports the configured PID when an idle process times out', () => {
    const process = getScenario('mercado-02').processes![0];
    const original = process.pid;
    process.pid = 1777;
    try {
      const run = hard();
      intervene(run, 'idle-timeout');
      advance(run, 100);
      expect(
        run.logs.some((entry) =>
          entry.message.includes('pid=1777 terminated reason=idle_in_transaction_session_timeout'),
        ),
      ).toBe(true);
    } finally {
      process.pid = original;
    }
  });
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
