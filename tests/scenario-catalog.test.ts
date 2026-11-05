import { expect, it } from 'vitest';
import { createScenarioCatalog, getScenario, scenarioCatalog } from '../packages/scenarios/src';
import { createRun, observe } from '../packages/sim-engine/src';

it('uses the scenario definition for the catalog challenge regardless of order', () => {
  const scenario = { ...getScenario('mercado-01'), challenge: 'Avançado' };
  expect(createScenarioCatalog([scenario])[0].challenge).toBe('Avançado');
});

it('shows direct customer messages rather than summaries in every incident', () => {
  for (const scenario of scenarioCatalog) {
    const messages = observe(createRun(42, 'guided', scenario.id)).events.filter(
      (event) => event.kind === 'customer',
    );
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) expect(message.message).toMatch(/^“.+”$/);
  }
});
