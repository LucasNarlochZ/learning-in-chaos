import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../apps/web/src/App';
import { EngineSession, type Client } from '../apps/web/src/session';
import { advance, createRun, intervene } from '../packages/sim-engine/src';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('labels immediate, follow-up and final measurements separately after restoring a resolved incident', async () => {
  const run = createRun(42, 'free', 'mercado-03');
  intervene(run, 'stop-import', undefined, 'orders-reconciliation');
  advance(run, 120);
  intervene(run, 'pool');
  advance(run, 120);
  intervene(run, 'create-index', undefined, 'customer-orders');
  advance(run, 420);
  localStorage.setItem('learning-in-chaos.run.v1', JSON.stringify(run.record));
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('button', { name: /Retomar investigação salva/ }));
  await userEvent.click(await screen.findByRole('button', { name: /Ler postmortem/ }));
  const final = screen.getByRole('region', { name: 'Estado final do serviço' });
  expect(final.textContent).toContain('60s consecutivos');
  const action = screen.getByRole('article', { name: /Análise de Criar índice · customer-orders/ });
  expect(within(action).getByText(/Antes de iniciar \(04:00\)/)).toBeTruthy();
  expect(within(action).getByText(/Ao concluir \(09:00\)/)).toBeTruthy();
  expect(within(action).getByText(/Após 60s de observação \(10:00\)/)).toBeTruthy();
  expect(action.textContent).toContain('fila acumulada');
});

it('rebuilds an older postmortem from its saved decisions before displaying the new measurements', async () => {
  const run = createRun();
  intervene(run, 'rollback');
  advance(run, 300);
  localStorage.setItem('learning-in-chaos.run.v1', JSON.stringify(run.record));
  const session = new EngineSession();
  let responses = 0;
  const client: Client = {
    async dispatch(command) {
      const snapshot = session.execute(command);
      if (responses++ === 0 && snapshot.report)
        delete (snapshot.report as Partial<typeof snapshot.report>).finalMetrics;
      return snapshot;
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('button', { name: /Retomar investigação salva/ }));
  await userEvent.click(await screen.findByRole('button', { name: /Ler postmortem/ }));
  expect(screen.getByRole('region', { name: 'Estado final do serviço' })).toBeTruthy();
  expect(responses).toBe(2);
});
