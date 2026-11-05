import { describe, expect, it } from 'vitest';
import {
  estimateCacheHitRate,
  createRun,
  advance,
  intervene,
  observe,
  replay,
} from '../packages/sim-engine/src';

describe('aggregate cache model', () => {
  it('estimates hits from reads, overlapping writes, key count and expiry', () => {
    const base = { readsPerSecond: 100, writesPerSecond: 10, keys: 100, ttlSeconds: 60 };
    const hit = estimateCacheHitRate(base);
    expect(hit).toBeGreaterThan(0);
    expect(hit).toBeLessThan(1);
    expect(estimateCacheHitRate({ ...base, writesPerSecond: 100 })).toBeLessThan(hit);
    expect(estimateCacheHitRate({ ...base, readsPerSecond: 200 })).toBeGreaterThan(hit);
    expect(estimateCacheHitRate({ ...base, ttlSeconds: 1 })).toBeLessThan(hit);
    expect(estimateCacheHitRate({ ...base, readsPerSecond: 0 })).toBe(0);
  });

  it('reports a workload-based rate and reproduces it on replay', () => {
    const run = createRun(42, 'free', 'mercado-02');
    intervene(run, 'cache', undefined, 'GET /products');
    advance(run, 121);
    const observation = observe(run);
    expect(observation.topology.caches[0].hitRate).toBeGreaterThan(0);
    expect(observation.topology.caches[0].hitRate).not.toBe(0.75);
    expect(observe(replay(run.record))).toEqual(observation);
  });

  it('reflects checkout write traffic when checkout processing is stopped and resumed', () => {
    const run = createRun(42, 'free', 'mercado-02');
    intervene(run, 'cache', undefined, 'GET /products/:id');
    advance(run, 120);
    const before = observe(run).topology.caches[0].hitRate;
    intervene(run, 'stop-import', undefined, 'checkout-processing');
    advance(run, 120);
    expect(observe(run).topology.caches[0].hitRate).toBeGreaterThan(before);
    intervene(run, 'resume-operation', undefined, 'checkout-processing');
    advance(run, 60);
    expect(observe(run).topology.caches[0].hitRate).toBeCloseTo(before);
    expect(observe(replay(run.record))).toEqual(observe(run));
  });

  it('reports no hits while the cache node is restarting', () => {
    const run = createRun(42, 'free', 'mercado-02');
    intervene(run, 'cache', undefined, 'GET /products');
    advance(run, 120);
    intervene(run, 'restart', undefined, 'cache');
    expect(observe(run).topology.caches[0].hitRate).toBe(0);
  });
});
