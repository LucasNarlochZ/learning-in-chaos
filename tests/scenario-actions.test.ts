import { expect, it } from 'vitest';
import { availableActions, requiresActionTarget } from '../packages/educational-content/src';
import { getScenario } from '../packages/scenarios/src';

it('uses scenario action settings for guided interventions and targeting', () => {
  const scenario = getScenario('mercado-01');
  const original = scenario.actions;
  try {
    scenario.actions = {
      ...original,
      guidedExtra: ['stop-import'],
      guidedTargeted: ['stop-import'],
    };
    expect(availableActions('guided', scenario.id).map((action) => action.id)).toContain(
      'stop-import',
    );
    expect(requiresActionTarget('guided', 'stop-import', scenario.id)).toBe(true);
  } finally {
    scenario.actions = original;
  }
});
