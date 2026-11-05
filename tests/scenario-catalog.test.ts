import { expect, it } from 'vitest';
import { createScenarioCatalog, getScenario } from '../packages/scenarios/src';

it('uses the scenario definition for the catalog challenge regardless of order', () => {
  const scenario = { ...getScenario('mercado-01'), challenge: 'Avançado' };
  expect(createScenarioCatalog([scenario])[0].challenge).toBe('Avançado');
});
