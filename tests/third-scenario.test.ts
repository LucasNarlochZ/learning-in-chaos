import { describe, expect, it } from 'vitest';
import { EngineSession } from '../apps/web/src/session';
import { scenarioCatalog, getScenario } from '../packages/scenarios/src';
import {
  advance,
  configureInstrumentation,
  createRun,
  explainQuery,
  inspectSessions,
  intervene,
  observe,
  replay,
  report,
  restoreRun,
} from '../packages/sim-engine/src';

const third = (mode: 'guided' | 'free' = 'guided', seed = 42) =>
  createRun(seed, mode, 'mercado-03');

describe('third difficult incident', () => {
  it('defines the scheduled database workload as a simulated process', () => {
    const process = getScenario('mercado-03').processes?.find(
      (item) => item.id === 'orders-reconciliation',
    );
    expect(process).toMatchObject({ pid: 610, databaseWorkPerSecond: 820, retryAfterSeconds: 45 });
    const run = third();
    inspectSessions(run);
    expect(run.processes.find((item) => item.definition.id === process!.id)?.running).toBe(true);
    expect(observe(run).databaseSessions!.filter((session) => session.pid === 610)).toHaveLength(1);
    advance(run, 10);
    expect(
      run.logs.find((entry) => entry.message.includes('job_progress') && entry.at === 10)?.message,
    ).toContain('active=true db_work_per_second=820');
  });

  it('defines the customer read session as a process', () => {
    const process = getScenario('mercado-03').processes?.find((item) => item.pid === 818);
    expect(process).toMatchObject({ id: 'customer-read', retryAfterSeconds: 30 });
    const run = third();
    inspectSessions(run);
    expect(observe(run).databaseSessions!.filter((session) => session.pid === 818)).toHaveLength(1);
    intervene(run, 'terminate-session', 818);
    advance(run, 30);
    expect(run.processes.find((item) => item.definition.id === 'customer-read')?.running).toBe(
      false,
    );
  });
  it('offers a neutral third briefing without diagnosis or a suggested intervention', () => {
    const entry = scenarioCatalog.find((scenario) => scenario.id === 'mercado-03');
    expect(entry).toMatchObject({ number: '003', challenge: 'Intermediário' });
    expect(entry!.briefing).not.toMatch(
      /índice|reconciliação|pistas falsas|sinais conflitantes|suspender/i,
    );
    const session = new EngineSession();
    const snapshot = session.execute({
      type: 'start',
      seed: 42,
      difficulty: 'guided',
      scenarioId: 'mercado-03',
    });
    expect(snapshot.report).toBeNull();
    expect(snapshot).not.toHaveProperty('inferences');
    expect(JSON.stringify(snapshot)).not.toContain(getScenario('mercado-03').rootCause);
  });

  it('has a different observable failure pattern and query evidence', () => {
    const run = third();
    const view = observe(run);
    expect(view.metrics.databaseUtilization).toBe(100);
    expect(view.metrics.apiUtilization).toBeLessThan(60);
    expect(view.metrics.latency).toBeGreaterThan(800);
    expect(view.database).toMatchObject({ idleInTransaction: 0, lockWaitMs: 0 });
    expect(explainQuery(run, 'GET /orders', 'customer-orders').text).toContain('Seq Scan');
    expect(explainQuery(run, 'GET /products', 'catalog-list').text).toContain('Index Scan');
    inspectSessions(run);
    expect(observe(run).databaseSessions!.every((session) => session.blockedBy === null)).toBe(
      true,
    );
    expect(
      observe(run).databaseSessions!.some((session) => session.connectionTag === 'c-r17'),
    ).toBe(true);
  });

  it.each(['rollback', 'idle-timeout', 'lock-timeout', 'pool', 'restart', 'scale-api'] as const)(
    'does not recover from %s alone',
    (action) => {
      const run = third('free');
      intervene(
        run,
        action,
        undefined,
        action === 'restart' ? 'api-1' : action === 'scale-api' ? 'api' : undefined,
      );
      advance(run, 600);
      expect(run.status).toBe('active');
      expect(run.metrics.errorRate).toBeGreaterThan(1);
    },
  );

  it('changes the selected query and preserves its SQL when adding an expression index', () => {
    const run = third('free');
    configureInstrumentation(run, 'query-plans', true);
    advance(run, 60);
    const before = explainQuery(run, 'GET /orders', 'customer-orders');
    intervene(run, 'create-index', undefined, 'customer-orders');
    advance(run, 300);
    const after = explainQuery(run, 'GET /orders', 'customer-orders');
    expect(after.sql).toBe(before.sql);
    expect(after.text).toContain('orders_customer_text_created_at_idx');
    expect(after.workUnits).toBeLessThan(before.workUnits);
    expect(run.status).toBe('active');
    expect(run.metrics.errorRate).toBeGreaterThan(1);
    expect(report(run).repaired).toBe(false);
  });

  it.each(['guided', 'free'] as const)(
    'requires correlating and treating both sources in %s mode',
    (mode) => {
      for (const seed of [0, 1, 42, 99, 4294967295]) {
        const run = third(mode, seed);
        intervene(run, 'stop-import', undefined, 'orders-reconciliation');
        advance(run, 180);
        expect(run.status).toBe('active');
        expect(run.metrics.errorRate).toBeGreaterThan(1);
        intervene(run, 'optimize-query', undefined, 'customer-orders');
        advance(run, 360);
        expect(run.status).toBe('resolved');
        expect(run.metrics.latency).toBeLessThan(800);
        expect(report(run).repaired).toBe(true);
        expect(report(run).remainingIssues).toEqual([]);
        expect(restoreRun(JSON.stringify(run.record))).toEqual(run);
        expect(report(replay(run.record))).toEqual(report(run));
      }
    },
  );

  it('gates session evidence behind instrumentation and enforces explicit eligible targets', () => {
    const run = third('free');
    expect(observe(run).database).toBeNull();
    expect(() => inspectSessions(run)).toThrow(/instrumentação/);
    configureInstrumentation(run, 'database-sessions', true);
    advance(run, 60);
    inspectSessions(run);
    expect(observe(run).databaseSessions).not.toBeNull();
    const before = structuredClone(run.record);
    expect(() => intervene(run, 'stop-import')).toThrow(/alvo/);
    expect(() => intervene(run, 'stop-import', undefined, 'inventory-sync')).toThrow(/alvo/);
    expect(run.record).toEqual(before);
    expect(observe(run).actionTargets['stop-import'].map((target) => target.id)).toContain(
      'orders-reconciliation',
    );
  });

  it('does not fix the scheduled operation by cancelling just one session', () => {
    const run = third();
    inspectSessions(run);
    intervene(run, 'terminate-session', 610);
    advance(run, 30);
    expect(run.events.some((event) => event.kind === 'job' && event.message.includes('45'))).toBe(
      true,
    );
    expect(
      observe(run).databaseSessions!.some((session) => session.connectionTag === 'c-r17'),
    ).toBe(false);
    expect(run.abortedCheckouts).toBe(0);
    advance(run, 45);
    expect(
      run.events.some((event) => event.kind === 'job' && event.message.includes('retomad')),
    ).toBe(true);
    expect(
      observe(run).databaseSessions!.some(
        (session) => session.connectionTag === 'c-r17' && session.pid !== 610,
      ),
    ).toBe(true);
    expect(run.status).toBe('active');
    expect(replay(run.record)).toEqual(run);
  });

  it('stops the chosen operation and keeps unrelated operations consequential', () => {
    const run = third('free');
    intervene(run, 'stop-import', undefined, 'checkout-processing');
    advance(run, 120);
    expect(
      observe(run).endpoints.find((endpoint) => endpoint.path === 'POST /checkout')!.errorRate,
    ).toBe(100);
    expect(run.status).toBe('active');
    expect(observe(run).topology.stoppedOperations).toEqual(['checkout-processing']);
  });

  it('can mitigate symptoms at extra infrastructure cost while reporting the remaining cause', () => {
    const run = third();
    intervene(run, 'optimize-query', undefined, 'customer-orders');
    advance(run, 240);
    intervene(run, 'replica');
    advance(run, 420);
    expect(run.status).toBe('resolved');
    expect(report(run).repaired).toBe(false);
    expect(report(run).remainingIssues.length).toBeGreaterThan(0);
    expect(run.metrics.hourlyCost).toBeGreaterThan(0.28);
  });
});

it.each(['create-index', 'optimize-query'] as const)(
  'does not repair a different query when targeting catalog with %s',
  (action) => {
    const run = third('free');
    intervene(run, action, undefined, 'catalog-list');
    advance(run, 300);
    intervene(run, 'stop-import', undefined, 'orders-reconciliation');
    advance(run, 300);
    expect(run.status).toBe('active');
    expect(run.system.regression).toBe(true);
  },
);

it('cancels a read session without attributing an aborted purchase to it', () => {
  const run = third();
  inspectSessions(run);
  intervene(run, 'terminate-session', 818);
  advance(run, 30);
  expect(run.abortedCheckouts).toBe(0);
  expect(
    run.events.some((event) => event.message.includes('Consulta de pedidos interrompida')),
  ).toBe(true);
  expect(run.status).toBe('active');
  expect(replay(run.record)).toEqual(run);
});

it('reports session cancellation according to the work that was interrupted', () => {
  for (const pid of [610, 818]) {
    const run = third();
    inspectSessions(run);
    intervene(run, 'terminate-session', pid);
    advance(run, 30);
    expect(
      [...run.logs]
        .reverse()
        .find((entry) => entry.message.includes(`db_session pid=${pid} terminated`))!.message,
    ).toContain('checkout_aborted=false');
    expect(report(run).inferences[0].hypothesis).not.toMatch(/transação responsável pelas esperas/);
  }
});

it('keeps a healthy checkout session termination costly after addressing the high-cost query', () => {
  const run = third();
  intervene(run, 'optimize-query', undefined, 'customer-orders');
  advance(run, 240);
  intervene(run, 'stop-import', undefined, 'orders-reconciliation');
  advance(run, 120);
  inspectSessions(run);
  intervene(run, 'terminate-session', 904);
  advance(run, 30);
  expect(run.abortedCheckouts).toBe(1);
  expect(run.metrics.errorRate).toBeGreaterThanOrEqual(4);
  expect(run.status).toBe('active');
});
