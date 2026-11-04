import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../apps/web/src/App';
import { EngineSession, type Client } from '../apps/web/src/session';

afterEach(cleanup);

it('explains instrumentation locks beside affected controls and clears them when collection is ready', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('radio', { name: /Incidente 003/ }));
  await userEvent.click(screen.getByLabelText(/Exploração livre/));
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Observabilidade' }));
  const description =
    /Aguarde a instrumentação atual: Sessões e esperas do banco.*60s simulados restantes.*Continue ou avance o tempo/;
  await userEvent.click(
    screen.getByRole('button', { name: 'Implementar Sessões e esperas do banco' }),
  );
  for (const name of [
    'Implementar Sessões e esperas do banco',
    'Implementar Planos de execução',
    'Implementar Logs detalhados',
  ]) {
    const button = screen.getByRole('button', { name, description });
    expect(button).toHaveProperty('disabled', true);
    expect(button.nextElementSibling?.id).toBe(button.getAttribute('aria-describedby'));
  }
  await userEvent.click(screen.getByRole('button', { name: /Reescrever consulta/ }));
  await userEvent.selectOptions(
    screen.getByLabelText('Alvo de Reescrever consulta'),
    'customer-orders',
  );
  expect(screen.getByRole('button', { name: /Aplicar intervenção/, description })).toHaveProperty(
    'disabled',
    true,
  );
  await userEvent.click(screen.getByRole('button', { name: '+30s' }));
  expect(
    screen.getByRole('button', {
      name: 'Implementar Planos de execução',
      description: /30s simulados restantes/,
    }),
  ).toHaveProperty('disabled', true);
  await userEvent.click(screen.getByRole('button', { name: '+30s' }));
  expect(screen.getByRole('button', { name: 'Implementar Planos de execução' })).toHaveProperty(
    'disabled',
    false,
  );
  expect(screen.getByRole('button', { name: /Aplicar intervenção/ })).toHaveProperty(
    'disabled',
    false,
  );
  expect(screen.queryAllByText(/Aguarde a instrumentação atual/)).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Aplicação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar sessões' }));
  await userEvent.click(screen.getByRole('button', { name: 'Observabilidade' }));
  await userEvent.click(screen.getByRole('button', { name: 'Implementar Planos de execução' }));
  expect(
    screen.getByRole('button', {
      name: 'Desativar Sessões e esperas do banco',
      description: /Aguarde a instrumentação atual: Planos de execução/,
    }),
  ).toHaveProperty('disabled', true);
  await userEvent.click(screen.getByRole('button', { name: 'Aplicação' }));
  const terminate = screen.getByRole('button', {
    name: 'Encerrar PID 610',
    description: /Aguarde a instrumentação atual: Planos de execução.*60s simulados restantes/,
  });
  expect(terminate).toHaveProperty('disabled', true);
  expect(terminate.nextElementSibling?.id).toBe(terminate.getAttribute('aria-describedby'));
  expect(screen.getByRole('button', { name: 'Atualizar sessões' })).toHaveProperty(
    'disabled',
    false,
  );
  await userEvent.click(screen.getByRole('button', { name: '+30s' }));
  await userEvent.click(screen.getByRole('button', { name: '+30s' }));
  expect(screen.getByRole('button', { name: 'Encerrar PID 610' })).toHaveProperty(
    'disabled',
    false,
  );
  expect(screen.queryAllByText(/Aguarde a instrumentação atual/)).toHaveLength(0);
}, 15000);
