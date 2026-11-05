export interface ProcessDefinition {
  id: string;
  pid: number;
  databaseWorkPerSecond: number;
  locks: { table: string; rowKeys: string[]; mode: 'exclusive' }[];
  retryAfterSeconds?: number;
  label?: string;
  resolvesIncident?: boolean;
  guidedDefault?: boolean;
  session?: {
    application: string;
    user: string;
    connectionTag: string;
    state: string;
    transactionAge: number;
    waitEvent: string;
    query: string;
  };
}

export interface SimulatedProcess {
  definition: ProcessDefinition;
  running: boolean;
  stopped: boolean;
  retryAt: number | null;
  attempts: number;
  startedAt: number;
}

export function createProcesses(definitions: ProcessDefinition[]): SimulatedProcess[] {
  return definitions.map((definition) => ({
    definition,
    running: true,
    stopped: false,
    retryAt: null,
    attempts: 0,
    startedAt: 0,
  }));
}

export function databaseWork(processes: SimulatedProcess[]) {
  return processes.reduce(
    (sum, process) => sum + (process.running ? process.definition.databaseWorkPerSecond : 0),
    0,
  );
}

export function conflictingProcesses(processes: SimulatedProcess[], table: string, rowKey: string) {
  return processes.filter(
    (process) =>
      process.running &&
      process.definition.locks.some(
        (lock) => lock.table === table && lock.rowKeys.includes(rowKey),
      ),
  );
}

export function terminateProcess(processes: SimulatedProcess[], pid: number, at: number) {
  const process = processes.find(
    (item) => item.running && item.definition.pid + item.attempts === pid,
  );
  if (!process) return false;
  process.running = false;
  process.retryAt =
    process.definition.retryAfterSeconds === undefined
      ? null
      : at + process.definition.retryAfterSeconds;
  return true;
}

export function advanceProcesses(processes: SimulatedProcess[], at: number) {
  const resumed: SimulatedProcess[] = [];
  for (const process of processes) {
    if (!process.stopped && process.retryAt !== null && process.retryAt <= at) {
      process.running = true;
      process.attempts++;
      process.startedAt = at;
      process.retryAt = null;
      resumed.push(process);
    }
  }
  return resumed;
}

export function stopProcess(processes: SimulatedProcess[], id: string) {
  const process = processes.find((item) => item.definition.id === id);
  if (!process) return false;
  process.running = false;
  process.stopped = true;
  process.retryAt = null;
  return true;
}

export function resumeProcess(processes: SimulatedProcess[], id: string) {
  const process = processes.find((item) => item.definition.id === id && item.stopped);
  if (!process) return false;
  process.stopped = false;
  process.running = true;
  return true;
}
