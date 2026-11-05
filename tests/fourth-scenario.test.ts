import { describe, expect, it } from 'vitest';
import { getScenario, scenarioCatalog } from '../packages/scenarios/src';
import { advance, createRun, intervene, observe, replay, report } from '../packages/sim-engine/src';

describe('fourth incident', () => {
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
