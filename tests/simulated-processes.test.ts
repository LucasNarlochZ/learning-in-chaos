import { expect, it } from 'vitest';
import {
  createProcesses,
  databaseWork,
  terminateProcess,
  advanceProcesses,
  stopProcess,
  resumeProcess,
  conflictingProcesses,
} from '../packages/sim-engine/src/processes';
import { scenarioSchema } from '../packages/scenario-schema/src';
import { getScenario } from '../packages/scenarios/src';
import {
  createRun,
  inspectSessions,
  observe,
  intervene,
  advance,
  replay,
} from '../packages/sim-engine/src';

const definition = {
  id: 'inventory-import',
  pid: 900,
  databaseWorkPerSecond: 120,
  locks: [{ table: 'inventory', rowKeys: ['sku-123'], mode: 'exclusive' as const }],
  retryAfterSeconds: 45,
};

it('removes process load and locks on termination and restores them on retry', () => {
  const processes = createProcesses([definition]);
  expect(databaseWork(processes)).toBe(120);
  expect(conflictingProcesses(processes, 'inventory', 'sku-123')).toHaveLength(1);
  terminateProcess(processes, 900, 10);
  expect(databaseWork(processes)).toBe(0);
  expect(conflictingProcesses(processes, 'inventory', 'sku-123')).toHaveLength(0);
  advanceProcesses(processes, 54);
  expect(databaseWork(processes)).toBe(0);
  advanceProcesses(processes, 55);
  expect(databaseWork(processes)).toBe(120);
});

it('stopping a job cancels its retry until it is resumed', () => {
  const processes = createProcesses([definition]);
  terminateProcess(processes, 900, 10);
  stopProcess(processes, 'inventory-import');
  advanceProcesses(processes, 100);
  expect(databaseWork(processes)).toBe(0);
  resumeProcess(processes, 'inventory-import');
  expect(databaseWork(processes)).toBe(120);
});

it('loads configured processes into the engine and terminates them through session inspection', () => {
  const scenario = getScenario('mercado-02');
  const parsed = scenarioSchema.parse({ ...scenario, processes: [definition] });
  expect(parsed).toHaveProperty('processes');
  const original = scenario.processes;
  scenario.processes = parsed.processes;
  try {
    const run = createRun(42, 'guided', scenario.id);
    inspectSessions(run);
    expect(observe(run).databaseSessions?.some((session) => session.pid === 900)).toBe(true);
    intervene(run, 'terminate-session', 900);
    advance(run, 30);
    expect(observe(run).databaseSessions?.some((session) => session.pid === 900)).toBe(false);
  } finally {
    scenario.processes = original;
  }
});

it('blocks only checkout rows that conflict with a running process lock', () => {
  const scenario = getScenario('mercado-02');
  const originalProcesses = scenario.processes;
  const originalSegments = scenario.checkoutSegments;
  const parsed = scenarioSchema.parse({
    ...scenario,
    processes: [definition],
    checkoutSegments: [
      {
        sku: 'sku-123',
        category: 'test',
        share: 0.5,
        lockAffected: false,
        lockResource: { table: 'inventory', rowKey: 'sku-123' },
      },
      {
        sku: 'sku-456',
        category: 'test',
        share: 0.5,
        lockAffected: false,
        lockResource: { table: 'inventory', rowKey: 'sku-456' },
      },
    ],
  });
  scenario.processes = parsed.processes;
  scenario.checkoutSegments = parsed.checkoutSegments;
  try {
    const run = createRun(42, 'guided', scenario.id);
    expect(observe(run).checkoutBreakdown.map((segment) => segment.errorRate)).toEqual([100, 0]);
    inspectSessions(run);
    intervene(run, 'terminate-session', 900);
    advance(run, 30);
    expect(observe(run).checkoutBreakdown.map((segment) => segment.errorRate)).toEqual([0, 0]);
  } finally {
    scenario.processes = originalProcesses;
    scenario.checkoutSegments = originalSegments;
  }
});

it('replays process retries and stopping a scheduled process', () => {
  const scenario = getScenario('mercado-02');
  const original = scenario.processes;
  scenario.processes = scenarioSchema.parse({ ...scenario, processes: [definition] }).processes;
  try {
    const run = createRun(42, 'free', scenario.id);
    intervene(run, 'stop-import', undefined, definition.id);
    advance(run, 120);
    expect(run.processes[0].running).toBe(false);
    expect(replay(run.record).processes[0].running).toBe(false);
  } finally {
    scenario.processes = original;
  }
});

it('rejects duplicate process IDs or PIDs', () => {
  const scenario = getScenario('mercado-02');
  expect(
    scenarioSchema.safeParse({ ...scenario, processes: [definition, { ...definition, pid: 901 }] })
      .success,
  ).toBe(false);
  expect(
    scenarioSchema.safeParse({
      ...scenario,
      processes: [definition, { ...definition, id: 'other' }],
    }).success,
  ).toBe(false);
});

it('adds running process work to database demand', () => {
  const scenario = getScenario('mercado-02');
  const original = scenario.processes;
  const originalCapacity = scenario.databaseCapacity;
  try {
    scenario.databaseCapacity = 10000;
    scenario.processes = [];
    const without = createRun(42, 'guided', scenario.id).metrics.databaseUtilization;
    scenario.processes = [definition];
    const withProcess = createRun(42, 'guided', scenario.id).metrics.databaseUtilization;
    expect(withProcess - without).toBeCloseTo(1.2);
  } finally {
    scenario.processes = original;
    scenario.databaseCapacity = originalCapacity;
  }
});
