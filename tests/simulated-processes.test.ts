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
