import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../apps/web/src/App';
import { ApplicationPanel } from '../apps/web/src/ApplicationPanel';
import { EngineSession, type Client } from '../apps/web/src/session';
import type { Observation } from '../packages/sim-engine/src';

afterEach(cleanup);

it('filters incident cards by difficulty and starts the selected incident', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  expect(screen.getAllByRole('radio', { name: /Incidente 00/ })).toHaveLength(3);
  await userEvent.click(screen.getByRole('button', { name: 'Intermediário' }));
  expect(screen.getAllByRole('radio', { name: /Incidente 00/ })).toHaveLength(2);
  expect(screen.queryByRole('radio', { name: /Incidente 001/ })).toBeNull();
  await userEvent.click(screen.getByRole('radio', { name: /Incidente 003/ }));
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  expect(await screen.findByText('INC–003')).toBeTruthy();
});

it('requires deploying optional telemetry and choosing intervention targets in free mode', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('radio', { name: /Incidente 002/ }));
  await userEvent.click(screen.getByLabelText(/Exploração livre/));
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aplicação' }));
  expect(screen.queryByRole('button', { name: 'Buscar plano de execução' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Consultar sessões' })).toBeNull();
  expect(screen.queryByLabelText('Métricas do banco')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Observabilidade' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Implementar Sessões e esperas do banco' }),
  );
  expect(screen.getByRole('status').textContent).toContain('60s');
  await userEvent.click(screen.getByRole('button', { name: '+30s' }));
  await userEvent.click(screen.getByRole('button', { name: '+30s' }));
  expect(screen.getByRole('button', { name: 'Desativar Sessões e esperas do banco' })).toBeTruthy();
  expect(screen.getByLabelText('Overhead da instrumentação').textContent).toContain('100');
  await userEvent.click(screen.getByRole('button', { name: 'Aplicação' }));
  expect(screen.getByLabelText('Métricas do banco')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Consultar sessões' })).toHaveProperty(
    'disabled',
    false,
  );
  await userEvent.click(screen.getByRole('button', { name: /Implementar cache/ }));
  expect(screen.getByRole('button', { name: /Aplicar intervenção/ })).toHaveProperty(
    'disabled',
    true,
  );
  await userEvent.selectOptions(screen.getByLabelText('Alvo de Implementar cache'), 'GET /orders');
  await userEvent.click(screen.getByRole('button', { name: /Aplicar intervenção/ }));
  expect(screen.getByRole('status').textContent).toContain('GET /orders');
}, 15000);

it('groups intervention tools by category and filters without applying an action', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  const database = screen.getByRole('region', { name: 'Intervenções de Banco de dados' });
  expect(within(database).getByRole('button', { name: /Criar índice do catálogo/ })).toBeTruthy();
  expect(
    within(screen.getByRole('region', { name: 'Intervenções de Capacidade' })).getByRole('button', {
      name: /Aumentar capacidade do banco/,
    }),
  ).toBeTruthy();
  await userEvent.selectOptions(
    screen.getByLabelText('Categoria de intervenção'),
    'Banco de dados',
  );
  expect(screen.queryByRole('button', { name: /Reverter versão/ })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /Limitar espera por bloqueios/ }));
  expect(screen.getByRole('button', { name: /Aplicar intervenção/ })).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText('Categoria de intervenção'), 'Todas');
  expect(screen.getByRole('button', { name: /Reverter versão/ })).toBeTruthy();
});

it('selects the difficult incident and exposes database evidence without revealing its diagnosis', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('radio', { name: /Incidente 002/ }));
  expect(screen.getByRole('heading', { name: 'O culpado da vez?' })).toBeTruthy();
  expect(
    screen.queryAllByText(
      /sinais conflitantes|evidências conflitantes|pistas falsas|repetir a solução anterior/i,
    ),
  ).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aplicação' }));
  expect(screen.queryByRole('table', { name: 'Sessões do PostgreSQL' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Consultar sessões' })).toHaveProperty(
    'disabled',
    false,
  );
  expect(screen.queryByRole('button', { name: 'Anotações' })).toBeNull();
  expect(screen.queryByLabelText('O que você acha que está acontecendo?')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar sessões' }));
  expect(screen.getByRole('table', { name: 'Sessões do PostgreSQL' }).textContent).toContain(
    'idle in transaction',
  );
  expect(screen.getByRole('table', { name: 'Sessões do PostgreSQL' }).textContent).toContain('731');
  expect(screen.queryByRole('heading', { name: 'O que realmente aconteceu' })).toBeNull();
  expect(screen.getByRole('button', { name: /Interromper importação de estoque/ })).toBeTruthy();
});

it('separates dashboard, deploys, customer messages, and alerts in Portuguese', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  expect(screen.getByText('Latência · p95')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Saúde dos componentes' })).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Deploys' }));
  expect(screen.getByRole('region', { name: 'Histórico de deploys' }).textContent).toContain(
    'v2.14.0',
  );
  expect(screen.queryByText(/Não consigo finalizar minha compra/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Mensagens de clientes' }));
  expect(screen.getByRole('region', { name: 'Mensagens de clientes' }).textContent).toContain(
    'Não consigo finalizar minha compra',
  );
  expect(screen.queryByText(/Versão v2.14.0 implantada/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Alertas' }));
  expect(screen.getByRole('region', { name: 'Alertas do sistema' }).textContent).toContain(
    '800 ms',
  );
  expect(screen.queryByText(/Não consigo finalizar minha compra/)).toBeNull();
});

it('presents a briefing without revealing the cause', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /Seu primeiro plantão/i })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Entrar na sala do incidente/i })).toBeTruthy();
  expect(screen.queryByText(/coluna sem índice/i)).toBeNull();
});

it('provides both difficulty modes and a reproducible seed', async () => {
  render(<App />);
  await userEvent.click(screen.getByLabelText(/Exploração livre/i));
  expect((screen.getByLabelText(/Exploração livre/i) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByLabelText('Seed da simulação')).toBeTruthy();
});

it('recovers query tools when a running session returns an older observation format', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      const snapshot = session.execute(command);
      if (command.type === 'start') {
        snapshot.observation.endpoints = snapshot.observation.endpoints.map(
          ({ queries, ...endpoint }) => endpoint,
        ) as Observation['endpoints'];
      }
      return snapshot;
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aplicação' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Buscar plano de execução' }));
  expect(await screen.findByLabelText('Plano de execução')).toHaveProperty(
    'textContent',
    expect.stringContaining('Seq Scan'),
  );
});

it('refreshes older observations before rendering the new database and product tools', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      const snapshot = session.execute(command);
      if (command.type === 'start') {
        delete (snapshot.observation as Partial<Observation>).database;
        delete (snapshot.observation as Partial<Observation>).checkoutBreakdown;
      }
      return snapshot;
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('radio', { name: /Incidente 002/ }));
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aplicação' }));
  expect(screen.getByRole('button', { name: 'Consultar sessões' })).toBeTruthy();
});

it('shows recovery instructions instead of crashing when query metadata is unavailable', () => {
  const session = new EngineSession();
  const snapshot = session.execute({ type: 'start', seed: 42, difficulty: 'guided' });
  const endpoints = snapshot.observation.endpoints.map(
    ({ queries, ...endpoint }) => endpoint,
  ) as Observation['endpoints'];
  render(
    <ApplicationPanel
      endpoints={endpoints}
      plan={null}
      busy={false}
      difficulty="guided"
      fetchPlan={() => {}}
    />,
  );
  expect(screen.getByRole('link', { name: 'Recarregar investigação' })).toBeTruthy();
});

it('opens the third difficult incident with database tools and explicit query and operation targets', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('radio', { name: /Incidente 003/ }));
  expect(screen.getByRole('heading', { name: 'O fim do expediente' })).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aplicação' }));
  expect(screen.getByRole('button', { name: 'Consultar sessões' })).toHaveProperty(
    'disabled',
    false,
  );
  await userEvent.click(screen.getByRole('button', { name: /Parar operação/ }));
  expect(screen.getByRole('button', { name: /Aplicar intervenção/ })).toHaveProperty(
    'disabled',
    true,
  );
  expect(
    within(screen.getByLabelText('Alvo de Parar operação')).getAllByRole('option').length,
  ).toBeGreaterThan(3);
  expect(screen.queryByRole('heading', { name: 'O que realmente aconteceu' })).toBeNull();
});

it('opens and focuses the session picker from interventions, including when Application is already open', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByRole('radio', { name: /Incidente 002/ }));
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  await userEvent.click(screen.getByRole('button', { name: /Encerrar sessão do banco/ }));
  await userEvent.click(screen.getByRole('button', { name: /Selecionar sessão na aplicação/ }));
  expect(await screen.findByRole('table', { name: 'Sessões do PostgreSQL' })).toBeTruthy();
  const picker = screen.getByRole('region', { name: 'Seleção de sessão do banco' });
  expect(document.activeElement).toBe(picker);
  await userEvent.click(screen.getByRole('button', { name: /Selecionar sessão na aplicação/ }));
  expect(document.activeElement).toBe(picker);
  const current = session.execute({ type: 'tick', seconds: 0 });
  expect(
    current.record.decisions.filter((decision) => decision.kind === 'inspection'),
  ).toHaveLength(1);
  expect(current.observation.pending).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /Encerrar PID 904$/ }));
  expect(screen.getByRole('dialog', { name: 'Encerrar sessão 904' })).toBeTruthy();
  expect(session.execute({ type: 'tick', seconds: 0 }).observation.pending).toBeNull();
});

it('focuses the missing instrumentation notice when selecting a session in free mode', async () => {
  const session = new EngineSession();
  const client: Client = {
    async dispatch(command) {
      return session.execute(command);
    },
    terminate() {},
  };
  render(<App client={client} />);
  await userEvent.click(screen.getByLabelText(/Exploração livre/));
  await userEvent.click(screen.getByRole('button', { name: /Entrar na sala do incidente/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar simulação' }));
  await userEvent.click(screen.getByRole('button', { name: /Encerrar sessão do banco/ }));
  await userEvent.click(screen.getByRole('button', { name: /Selecionar sessão na aplicação/ }));
  expect(document.activeElement).toBe(
    screen.getByRole('region', { name: 'Seleção de sessão do banco' }),
  );
  expect(screen.getByRole('heading', { name: 'Sessões do banco não instrumentadas' })).toBeTruthy();
  expect(screen.queryByRole('table', { name: 'Sessões do PostgreSQL' })).toBeNull();
  expect(session.execute({ type: 'tick', seconds: 0 }).record.decisions).toEqual([]);
  const notice = screen.getByRole('region', { name: 'Seleção de sessão do banco' });
  await userEvent.click(within(notice).getByRole('button', { name: /Configurar instrumentação/ }));
  expect(
    screen.getByRole('button', { name: 'Implementar Sessões e esperas do banco' }),
  ).toBeTruthy();
});
