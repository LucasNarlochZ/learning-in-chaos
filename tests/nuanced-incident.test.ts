import { describe, expect, it } from 'vitest';
import { EngineSession } from '../apps/web/src/session';
import { advance, createRun, explainQuery, intervene, observe, replay, report, restoreRun } from '../packages/sim-engine/src';

function start() {
  const session = new EngineSession();
  session.execute({ type: 'start', seed: 42, difficulty: 'guided', scenarioId: 'mercado-02' });
  return session;
}

function inspect(session: EngineSession) {
  return session.execute({ type: 'inspect-sessions' });
}

describe('incident with partial deployment regression and targeted locks', () => {
  it('improves latency after rollback but keeps the same partial failure rate', () => {
    const run = createRun(42, 'guided', 'mercado-02');
    const before = observe(run);
    expect(explainQuery(run, 'POST /checkout', 'checkout-pricing').text).toContain('Seq Scan');
    intervene(run, 'rollback');
    advance(run, 180);
    const after = observe(run);
    expect(explainQuery(run, 'POST /checkout', 'checkout-pricing').text).toContain('Index Scan');
    expect(after.metrics.latency).toBeLessThan(before.metrics.latency);
    expect(after.metrics.errorRate).toBeCloseTo(8);
    expect(after.endpoints.find(e => e.path === 'POST /checkout')!.errorRate).toBeCloseTo(40);
    expect(run.status).toBe('active');
    expect(after.stableSeconds).toBe(0);
    expect(replay(run.record)).toEqual(run);
  });

  it('restricts failures to particular products, preserving successful checkouts', () => {
    const view = observe(createRun(42, 'guided', 'mercado-02'));
    expect(view.checkoutBreakdown.some(c => c.errorRate === 0)).toBe(true);
    expect(view.checkoutBreakdown.filter(c => c.errorRate > 0).map(c => c.category)).toEqual(['Eletrônicos', 'Eletrônicos']);
    const checkoutErrors = view.checkoutBreakdown.reduce((sum, c) => sum + c.share * c.errorRate, 0);
    expect(checkoutErrors).toBeCloseTo(40);
    expect(checkoutErrors * 0.2).toBeCloseTo(view.metrics.errorRate);
    expect(view.endpoints.filter(e => e.path.startsWith('GET ')).every(e => e.errorRate === 0)).toBe(true);
  });

  it('exposes only aggregate database evidence until explicit inspection', () => {
    const session = start();
    const before = session.execute({ type: 'tick', seconds: 10 });
    expect(before.observation.databaseSessions).toBeNull();
    expect(before.observation.database!.idleInTransaction).toBeGreaterThan(0);
    expect(before.observation.database!.lockWaitMs).toBeGreaterThan(0);
    expect(before.observation.logs.every(log => !log.message.includes('blocking_pid=731'))).toBe(true);
    const details = inspect(session);
    expect(details.observation.databaseSessions!.find(s => s.pid === 731)!.application).toBe('mercado-worker');
    expect(details.observation.databaseSessions!.find(s => s.pid === 731)!.user).toBe('mercado_app');
    expect(details.observation.databaseSessions!.find(s => s.pid === 904)!.application).toBe('mercado-worker');
    expect(details.observation.events.some(event => event.kind === 'job' && event.message.includes('6f2'))).toBe(true);
    expect(restoreRun(JSON.stringify(details.record)).sessionsInspected).toBe(true);
  });

  it('charges for terminating a healthy session without clearing the blocker, then permits a correct target', () => {
    const session = start();
    inspect(session);
    session.execute({ type: 'terminate-session', pid: 904 });
    const damaged = session.execute({ type: 'tick', seconds: 30 });
    expect(damaged.observation.metrics.errorRate).toBeGreaterThan(8);
    expect(damaged.observation.databaseSessions!.some(s => s.pid === 731)).toBe(true);
    expect(damaged.observation.abortedCheckouts).toBe(1);
    expect(damaged.observation.status).toBe('active');
    session.execute({ type: 'terminate-session', pid: 731 });
    const released = session.execute({ type: 'tick', seconds: 30 });
    expect(released.observation.metrics.errorRate).toBe(0);
    const recovered = session.execute({ type: 'tick', seconds: 60 });
    expect(recovered.observation.status).toBe('resolved');
    expect(recovered.report!.abortedCheckouts).toBe(1);
    expect(recovered.report!.remainingIssues.length).toBeGreaterThan(0);
    expect(observe(replay(recovered.record))).toEqual(recovered.observation);
  });

  it('rejects missing, unknown and uninspected session targets without changing the record', () => {
    const session = start();
    expect(() => session.execute({ type: 'terminate-session', pid: 731 })).toThrow();
    const snapshot = inspect(session);
    expect(() => session.execute({ type: 'terminate-session', pid: 999 })).toThrow();
    expect(() => session.execute({ type: 'action', action: 'terminate-session' })).toThrow();
    expect(session.execute({ type: 'tick', seconds: 0 }).record).toEqual(snapshot.record);
  });

  it('recovers after lock treatment even while the minor deployment regression remains', () => {
    const run = createRun(1, 'guided', 'mercado-02');
    intervene(run, 'stop-import');
    advance(run, 300);
    expect(run.status).toBe('resolved');
    expect(report(run).remainingIssues).toHaveLength(1);
    expect(report(run).repaired).toBe(true);
  });

  it('rejects the old second-scenario version while preserving first-scenario saves', () => {
    const run = createRun(42, 'guided', 'mercado-02');
    expect(run.record.scenarioVersion).toBe('2.0.0');
    expect(() => restoreRun(JSON.stringify({ ...run.record, scenarioVersion: '1.0.0' }))).toThrow();
    const first = createRun();
    expect(restoreRun(JSON.stringify(first.record))).toEqual(first);
  });
});


it('infers tested causes from interventions and their measured outcomes only in the postmortem', () => {
  const session = start();
  session.execute({ type: 'action', action: 'rollback' });
  const rolledBack = session.execute({ type: 'tick', seconds: 180 });
  expect(rolledBack.report).toBeNull();
  session.execute({ type: 'action', action: 'stop-import' });
  session.execute({ type: 'tick', seconds: 120 });
  const ended = session.execute({ type: 'finish' });
  expect(ended.report!.inferences).toHaveLength(2);
  expect(ended.report!.inferences[0]).toMatchObject({ name: 'Reverter versão', completed: true, before: { errors: 8 }, after: { errors: 8 } });
  expect(ended.report!.inferences[0].hypothesis).toMatch(/deploy/i);
  expect(ended.report!.inferences[0].after!.latency).toBeLessThan(ended.report!.inferences[0].before.latency);
  expect(ended.report!.inferences[1]).toMatchObject({ after: { errors: 0 } });
  expect(new EngineSession().execute({ type: 'restore', json: JSON.stringify(ended.record) }).report).toEqual(ended.report);
});

it('does not attribute a result to an unfinished intervention', () => {
  const session = start();
  session.execute({ type: 'action', action: 'rollback' });
  const ended = session.execute({ type: 'finish' });
  expect(ended.report!.inferences[0]).toMatchObject({ completed: false, after: null });
});


it('retains intervention measurements after the rolling chart history expires', () => {
  const session = start();
  session.execute({ type: 'action', action: 'rollback' });
  const ended = session.execute({ type: 'tick', seconds: 3600 });
  expect(ended.observation.history[0].at).toBeGreaterThan(180);
  expect(ended.report!.inferences[0]).toMatchObject({ completed: true, before: { errors: 8 }, after: { errors: 8 } });
});
