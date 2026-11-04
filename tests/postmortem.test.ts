import { expect, it } from 'vitest';
import { advance, createRun, finish, intervene, replay, report } from '../packages/sim-engine/src';

function indexUnderLoad() {
  const run = createRun(42, 'free', 'mercado-03');
  intervene(run, 'stop-import', undefined, 'orders-reconciliation');
  advance(run, 120);
  intervene(run, 'pool');
  advance(run, 120);
  intervene(run, 'create-index', undefined, 'customer-orders');
  advance(run, 300);
  return run;
}

it('separates the immediate post-index queue from a later observation and final service state', () => {
  const run = indexUnderLoad();
  const immediate = report(run).inferences[2];
  expect(immediate.after).toMatchObject({ errors: 0 });
  expect(immediate.after!.latency).toBeGreaterThan(800);
  expect(immediate.after!.queue).toBeGreaterThan(0);
  expect(immediate.followUp).toBeNull();
  const completesAt = run.record.elapsed;
  advance(run, 120);
  const ended = report(run);
  const result = ended.inferences[2];
  expect(ended.resolved).toBe(true);
  expect(result.completesAt).toBe(completesAt);
  expect(result.followUp).toMatchObject({ at: completesAt + 60, errors: 0, queue: 0 });
  expect(result.followUp!.latency).toBeLessThan(800);
  expect(result.observationEndedByChange).toBe(false);
  expect(ended.finalMetrics).toMatchObject({
    at: run.record.elapsed,
    errors: 0,
    stableSeconds: 60,
  });
  expect(ended.finalMetrics.latency).toBeLessThan(800);
  expect(report(replay(run.record))).toEqual(ended);
});

it('stops attributing follow-up observations when another intervention starts', () => {
  const run = indexUnderLoad();
  advance(run, 5);
  const until = run.record.elapsed;
  const captured = {
    latency: run.metrics.latency,
    errors: run.metrics.errorRate,
    queue: run.metrics.queue,
  };
  intervene(run, 'restart', undefined, 'api-1');
  advance(run, 10);
  const result = report(run).inferences[2];
  expect(result.followUp).toEqual({ at: until, ...captured });
  expect(result.observationEndedByChange).toBe(true);
  expect(result.followUp!.errors).toBe(0);
  expect(run.metrics.errorRate).toBe(100);
});

it('does not invent a follow-up window for an unfinished action or an immediate next change', () => {
  const run = indexUnderLoad();
  intervene(run, 'restart', undefined, 'api-1');
  finish(run);
  const result = report(run);
  expect(result.inferences[2].followUp).toBeNull();
  expect(result.inferences[2].observationEndedByChange).toBe(true);
  expect(result.inferences[3]).toMatchObject({ completed: false, after: null, followUp: null });
});
