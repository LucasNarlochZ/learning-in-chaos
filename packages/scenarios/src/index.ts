import checkout from '../checkout.json';
import stockLock from '../stock-lock.json';
import nightShift from '../night-shift.json';
import { scenarioSchema } from '../../scenario-schema/src';

const scenarios = [checkout, stockLock, nightShift].map((definition) =>
  scenarioSchema.parse(definition),
);

export const scenarioCatalog = scenarios.map(({ id, title, briefing, service }, index) => ({
  id,
  title,
  briefing,
  service,
  number: String(index + 1).padStart(3, '0'),
  challenge: index === 0 ? 'Inicial' : 'Intermediário',
}));

export function getScenario(id: string) {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error('Cenário desconhecido.');
  return scenario;
}
