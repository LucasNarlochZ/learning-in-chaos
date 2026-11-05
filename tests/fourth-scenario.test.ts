import { describe, expect, it } from 'vitest';
import { getScenario, scenarioCatalog } from '../packages/scenarios/src';
import { advance, createRun, intervene, observe, replay, report } from '../packages/sim-engine/src';

describe('fourth incident', () => {
  it('provides timestamped traffic history and contextual evidence without a calculated baseline log field', () => {
    const run = createRun(42, 'guided', 'mercado-04');
    const history = observe(run).history;
    expect(history[0].at).toBeLessThanOrEqual(-1800);
    expect(history[0].rps).toBeLessThan(history[history.length - 1].rps);
    expect(run.logs.some((entry) => entry.at <= -1800)).toBe(true);
    expect(run.logs.some((entry) => /previous_baseline/.test(entry.message))).toBe(false);
    expect(run.events.some((entry) => /black friday/i.test(entry.message))).toBe(true);
    expect(replay(run.record)).toEqual(run);
  });
  it('offers a hard incident without revealing its diagnosis in the briefing', () => {
    const scenario = getScenario('mercado-04');
    expect(scenarioCatalog.find((item) => item.id === scenario.id)?.challenge).toBe('Avançado');
    expect(scenario.briefing).not.toContain(scenario.rootCause);
    expect(observe(createRun(42, 'guided', scenario.id))).not.toHaveProperty('rootCause');
  });

  it.each(['guided', 'free'] as const)('models and resolves the incident in %s mode', (mode) => {
    const run = createRun(42, mode, 'mercado-04');
    expect(run.metrics.errorRate).toBeGreaterThan(1);
    expect(run.metrics.apiUtilization).toBe(100);
    expect(run.metrics.databaseUtilization).toBeLessThan(100);
    intervene(run, 'scale-api', undefined, mode === 'free' ? 'api' : undefined);
    advance(run, 600);
    expect(run.status).toBe('resolved');
    expect(report(run).repaired).toBe(false);
    expect(replay(run.record)).toEqual(run);
  });

  it('does not recover by changing the database pool', () => {
    const run = createRun(42, 'free', 'mercado-04');
    intervene(run, 'pool');
    advance(run, 600);
    expect(run.status).toBe('active');
    expect(run.metrics.errorRate).toBeGreaterThan(1);
  });
});
