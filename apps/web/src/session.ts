import {
  addHypothesis,
  configureInstrumentation,
  advance,
  createRun,
  explainQuery,
  finish,
  inspectSessions,
  intervene,
  observe,
  report,
  restoreRun,
  type Observation,
  type QueryPlan,
  type Report,
  type Run,
  type RunRecord,
} from '../../../packages/sim-engine/src';
import type { ActionId, Difficulty, InstrumentId } from '../../../packages/educational-content/src';

export type Command =
  | { type: 'start'; seed: number; difficulty: Difficulty; scenarioId?: string }
  | { type: 'restore'; json: string }
  | { type: 'tick'; seconds: number }
  | { type: 'action'; action: ActionId; target?: string }
  | { type: 'hypothesis'; text: string }
  | { type: 'query-plan'; endpoint: string; queryId: string }
  | { type: 'instrumentation'; metric: InstrumentId; enabled: boolean }
  | { type: 'inspect-sessions' }
  | { type: 'terminate-session'; pid: number }
  | { type: 'finish' };
export interface Snapshot {
  observation: Observation;
  record: RunRecord;
  report: Report | null;
  queryPlan: QueryPlan | null;
}
export interface Client {
  dispatch(command: Command): Promise<Snapshot>;
  terminate(): void;
}

export class EngineSession {
  private run: Run | null = null;
  private queryPlan: QueryPlan | null = null;

  execute(command: Command): Snapshot {
    if (command.type === 'start')
      this.run = createRun(command.seed, command.difficulty, command.scenarioId);
    if (command.type === 'restore') {
      try {
        this.run = restoreRun(command.json);
      } catch {
        throw new Error(
          'O progresso salvo está danificado ou usa uma versão incompatível. Inicie uma nova investigação.',
        );
      }
    }
    if (!this.run) throw new Error('Inicie um incidente primeiro.');
    if (command.type === 'start' || command.type === 'restore') this.queryPlan = null;
    if (command.type === 'tick') advance(this.run, command.seconds);
    if (command.type === 'action') intervene(this.run, command.action, undefined, command.target);
    if (command.type === 'instrumentation') {
      configureInstrumentation(this.run, command.metric, command.enabled);
      if (!command.enabled && command.metric === 'query-plans') this.queryPlan = null;
    }
    if (command.type === 'hypothesis') addHypothesis(this.run, command.text);
    if (command.type === 'inspect-sessions') inspectSessions(this.run);
    if (command.type === 'terminate-session') intervene(this.run, 'terminate-session', command.pid);
    if (command.type === 'finish') finish(this.run);
    if (command.type === 'query-plan')
      this.queryPlan = explainQuery(this.run, command.endpoint, command.queryId);
    return structuredClone({
      observation: observe(this.run),
      record: this.run.record,
      report: this.run.status === 'active' ? null : report(this.run),
      queryPlan: this.queryPlan,
    });
  }
}
