import checkout from '../checkout.json';
import stockLock from '../stock-lock.json';
import nightShift from '../night-shift.json';
import { scenarioSchema, type Scenario } from '../../scenario-schema/src';

const scenarios = [checkout, stockLock, nightShift].map((definition) =>
  scenarioSchema.parse(definition),
);

export const createScenarioCatalog = (definitions: Scenario[]) =>
  definitions.map(({ id, title, briefing, service, challenge }, index) => ({
    id,
    title,
    briefing,
    service,
    number: String(index + 1).padStart(3, '0'),
    challenge,
  }));

export const scenarioCatalog = createScenarioCatalog(scenarios);

export function getScenario(id: string) {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error('Cenário desconhecido.');
  return scenario;
}
