import { describe, expect, it } from 'vitest';
import {
  createRun,
  advance,
  intervene,
  observe,
  replay,
  report,
  addHypothesis,
  restoreRun,
} from '../packages/sim-engine/src';
import { scenarioSchema } from '../packages/scenario-schema/src';
import scenario from '../packages/scenarios/checkout.json';

describe('deterministic incident simulation', () => {
  it('validates declarative scenarios and rejects impossible capacity', () => {
    expect(scenarioSchema.safeParse(scenario).success).toBe(true);
    expect(scenarioSchema.safeParse({ ...scenario, databaseCapacity: -1 }).success).toBe(false);
  });

  it('starts with symptoms without exposing the diagnosis in observations', () => {
    const view = observe(createRun(42, 'guided'));
    expect(view.metrics.latency).toBeGreaterThan(800);
    expect(view.endpoints.find((e) => e.path === 'GET /products')!.latency).toBeGreaterThan(800);
    expect(JSON.stringify(view)).not.toContain('rootCause');
    expect(view.events.some((e) => e.kind === 'deploy')).toBe(true);
  });

  it('reproduces identical observations for a seed and simulated decisions', () => {
    const run = createRun(52, 'free');
    advance(run, 20);
    intervene(run, 'rollback');
    advance(run, 220);
    expect(replay(run.record)).toEqual(run);
  });

  it('gives the same result regardless of clock batching', () => {
    const a = createRun(3, 'guided');
    const b = createRun(3, 'guided');
    advance(a, 120);
    for (let i = 0; i < 120; i++) advance(b, 1);
    expect(a).toEqual(b);
  });

  it('keeps an untreated incident degraded', () => {
    const run = createRun(7, 'guided');
    advance(run, 600);
    expect(run.status).toBe('active');
    expect(observe(run).metrics.errorRate).toBeGreaterThan(0);
    expect(report(run).failedRequests).toBeGreaterThan(0);
  });

  it.each(['guided', 'free'] as const)(
    'allows recovery by rollback in %s mode after deployment delay',
    (mode) => {
      const run = createRun(7, mode);
      intervene(run, 'rollback');
      advance(run, 179);
      expect(run.status).toBe('active');
      advance(run, 121);
      expect(run.status).toBe('resolved');
      expect(observe(run).metrics.latency).toBeLessThan(800);
      expect(report(run).rootCause).toBeTruthy();
      expect(report(run).timeline.some((e) => e.kind === 'action')).toBe(true);
    },
  );

  it('supports an alternative query repair strategy', () => {
    const run = createRun(7, 'free');
    intervene(run, 'optimize-query', undefined, 'catalog-list');
    advance(run, 420);
    expect(run.status).toBe('resolved');
  });

  it('capacity changes affect queues and cost without repairing the regression', () => {
    const run = createRun(7, 'free');
    const before = observe(run);
    intervene(run, 'replica');
    advance(run, 330);
    const after = observe(run);
    expect(after.metrics.databaseUtilization).toBeLessThan(before.metrics.databaseUtilization);
    expect(after.metrics.hourlyCost).toBeGreaterThan(before.metrics.hourlyCost);
    expect(run.system.regression).toBe(true);
  });

  it('rejects unavailable, duplicate and concurrent interventions without mutation', () => {
    const run = createRun(1, 'guided');
    expect(() => intervene(run, 'scale-api')).toThrow();
    intervene(run, 'cache');
    const snapshot = structuredClone(run);
    expect(() => intervene(run, 'rollback')).toThrow();
    expect(run).toEqual(snapshot);
    advance(run, 120);
    expect(() => intervene(run, 'cache')).toThrow();
  });

  it('preserves hypotheses and validates saved replay records', () => {
    const run = createRun(9, 'guided');
    addHypothesis(run, 'A recent change increased database work.');
    advance(run, 12);
    expect(restoreRun(JSON.stringify(run.record))).toEqual(run);
    expect(report(run).hypotheses).toHaveLength(1);
    expect(() => restoreRun('{"seed": 1}')).toThrow();
    expect(() => restoreRun(JSON.stringify({ ...run.record, engineVersion: 'unknown' }))).toThrow();
  });

  it('rejects nonfinite time and bounds long runs', () => {
    const run = createRun(1, 'guided');
    expect(() => advance(run, Infinity)).toThrow();
    expect(() => advance(run, -1)).toThrow();
    advance(run, 3600);
    expect(run.status).toBe('ended');
  });

  it('derives overall latency from the endpoint distribution', () => {
    const view = observe(createRun(8, 'guided'));
    const latencies = view.endpoints.map((endpoint) => endpoint.latency);
    expect(view.metrics.latency).toBe(Math.max(...latencies));
  });

  it('drains database work while the API is unavailable during restart', () => {
    const run = createRun(8, 'free');
    intervene(run, 'restart', undefined, 'api-1');
    advance(run, 10);
    expect(run.metrics.queue).toBe(0);
    expect(run.metrics.errorRate).toBe(100);
    expect(run.system.regression).toBe(true);
  });

  it.each(['rollback', 'optimize-query', 'cache', 'replica'] as const)(
    'reference strategy %s recovers across seeds in both modes',
    (action) => {
      for (const mode of ['guided', 'free'] as const) {
        for (const seed of [0, 1, 42, 99, 4294967295]) {
          const run = createRun(seed, mode);
          intervene(
            run,
            action,
            undefined,
            mode === 'free'
              ? (
                  { cache: 'GET /products', 'optimize-query': 'catalog-list' } as Partial<
                    Record<typeof action, string>
                  >
                )[action]
              : undefined,
          );
          advance(run, 600);
          expect(run.status).toBe('resolved');
        }
      }
    },
  );
});
