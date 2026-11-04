import { expect, test } from '@playwright/test';

test('intervention categories filter and apply a new database configuration on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('radio', { name: /Incidente 002/ }).check();
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  await page.getByRole('button', { name: 'Pausar simulação', exact: true }).click();
  await page.getByLabel('Categoria de intervenção').selectOption('Banco de dados');
  await expect(page.getByRole('region', { name: 'Intervenções de Banco de dados' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Reverter versão/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Limitar espera por bloqueios/ }).click();
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '+30s', exact: true }).click();
    await expect(page.getByRole('button', { name: '+30s', exact: true })).toBeEnabled();
  }
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Arquitetura', exact: true })
    .click();
  await expect(page.getByText('1 segundo', { exact: true })).toBeVisible();
  await expect(page.getByText('Incidente ativo', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Categoria de intervenção').selectOption('Todas');
  await expect(page.getByRole('button', { name: /Reverter versão/ })).toBeVisible();
});

test('difficult incident requires checking rollback, dimensions, session identity, and the cost of a wrong target', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /Incidente 002/ }).check();
  await expect(page.getByRole('heading', { name: 'O culpado da vez?' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  await page.getByRole('button', { name: 'Pausar simulação', exact: true }).click();
  const latency = async () =>
    Number((await page.locator('.metric-number').nth(1).innerText()).replace(/\D/g, ''));
  const before = await latency();
  const tools = page.getByRole('navigation', { name: 'Ferramentas de investigação' });
  await tools.getByRole('button', { name: 'Deploys', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Histórico de deploys' })).toContainText('v2.15.0');
  await expect(page.getByRole('region', { name: 'Atividades agendadas' })).toContainText('6f2');
  await page.getByRole('button', { name: /Operações Reverter versão/ }).click();
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: '+30s', exact: true }).click();
    await expect(page.getByRole('button', { name: '+30s', exact: true })).toBeEnabled();
  }
  await tools.getByRole('button', { name: 'Dashboard', exact: true }).click();
  expect(await latency()).toBeLessThan(before);
  await expect(page.getByText('Incidente ativo', { exact: true })).toBeVisible();
  await tools.getByRole('button', { name: 'Endpoints', exact: true }).click();
  const breakdown = page.getByRole('table', { name: 'Compras por dimensão' });
  await expect(breakdown.getByRole('row', { name: /SKU-101/ })).toContainText('100%');
  await expect(breakdown.getByRole('row', { name: /SKU-201/ })).toContainText('0%');
  await page.getByLabel('Dimensão das compras').selectOption('category');
  await expect(breakdown.getByRole('row', { name: /Eletrônicos/ })).toContainText('100%');
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Sessões do PostgreSQL' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Consultar sessões' })).toBeEnabled();
  await page.getByRole('button', { name: 'Consultar sessões' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Retomar investigação salva' }).click();
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  const sessions = page.getByRole('table', { name: 'Sessões do PostgreSQL' });
  await expect(sessions).toContainText('c-6f2');
  await expect(sessions).toContainText('Bloqueada pelo PID 731');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Encerrar PID 904', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar encerramento do PID 904' }).click();
  await page.getByRole('button', { name: '+30s', exact: true }).click();
  await expect(page.getByRole('button', { name: '+30s', exact: true })).toBeEnabled();
  await expect(sessions).toContainText('Bloqueada pelo PID 731');
  await tools.getByRole('button', { name: 'Alertas', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Alertas do sistema' })).toContainText(
    'Compra abortada',
  );
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar PID 731', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar encerramento do PID 731' }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: '+30s', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.getByRole('button', { name: '+30s', exact: true }).isEnabled()) ||
          (await page.getByRole('button', { name: 'Ler postmortem' }).isVisible()),
      )
      .toBe(true);
    if (await page.getByRole('button', { name: 'Ler postmortem' }).isVisible()) break;
  }
  await expect(sessions).not.toContainText('Bloqueada pelo PID 731');
  await page.getByRole('button', { name: 'Ler postmortem' }).click();
  await expect(page.getByRole('heading', { name: 'O que realmente aconteceu' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inferência pelas ações' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suas hipóteses' })).toHaveCount(0);
  await expect(page.getByText(/Causa removida/)).toBeVisible();
  await expect(page.getByText(/Compras abortadas ao encerrar sessões: 1/)).toBeVisible();
});

test('larger typography fits the dashboard and query plan on desktop and mobile', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  const tools = page.getByRole('navigation', { name: 'Ferramentas de investigação' });
  const dashboard = tools.getByRole('button', { name: 'Dashboard', exact: true });
  expect(
    await dashboard.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(12);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await dashboard.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
    await page.getByRole('button', { name: 'Buscar plano de execução' }).click();
    const plan = page.getByLabel('Plano de execução');
    expect(
      await plan.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(width === 390 ? 11 : 12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('investigate, record evidence, recover, and restore the postmortem', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Pausar simulação', exact: true }).click();
  const tools = page.getByRole('navigation', { name: 'Ferramentas de investigação' });
  await expect(page.getByRole('heading', { name: 'Saúde dos componentes' })).toBeVisible();
  await tools.getByRole('button', { name: 'Deploys', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Histórico de deploys' })).toContainText('v2.14.0');
  await expect(page.getByText(/Não consigo finalizar minha compra/)).toHaveCount(0);
  await tools.getByRole('button', { name: 'Mensagens de clientes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Mensagens de clientes' })).toContainText(
    'Não consigo finalizar minha compra',
  );
  await expect(page.getByText(/Versão v2.14.0 implantada/)).toHaveCount(0);
  await tools.getByRole('button', { name: 'Alertas', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Alertas do sistema' })).toContainText('800 ms');
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Buscar plano de execução' })).toBeVisible();
  await expect(page.getByLabel('Plano de execução')).toHaveCount(0);
  await page.getByRole('button', { name: 'Buscar plano de execução' }).click();
  await expect(page.getByLabel('Plano de execução')).toContainText('Seq Scan on products');
  await page.getByLabel('Endpoint da aplicação').selectOption('GET /orders');
  await expect(page.getByLabel('Plano de execução')).toHaveCount(0);
  await page.getByRole('button', { name: 'Buscar plano de execução' }).click();
  await expect(page.getByLabel('Plano de execução')).toContainText(
    'Index Scan using orders_customer_id_idx',
  );
  await page.getByLabel('Endpoint da aplicação').selectOption('GET /products');
  await tools.getByRole('button', { name: 'Logs', exact: true }).click();
  await page.getByLabel('Buscar nos logs').fill('SeqScan');
  await expect(page.getByRole('log')).toContainText('rows_examined=48000');
  await page.getByLabel('Buscar nos logs').fill('no matching log');
  await expect(page.getByText('Nenhum log corresponde à busca.')).toBeVisible();
  await expect(tools.getByRole('button', { name: 'Anotações', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Operações Reverter versão/ }).click();
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  await expect(page.getByRole('status')).toContainText('180s de tempo simulado restantes');
  for (let i = 0; i < 9; i++) {
    await page.getByRole('button', { name: '+30s', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.getByRole('button', { name: '+30s', exact: true }).isEnabled()) ||
          (await page.getByRole('button', { name: 'Ler postmortem' }).isVisible()),
      )
      .toBe(true);
    if (await page.getByRole('button', { name: 'Ler postmortem' }).isVisible()) break;
  }
  await page.getByRole('button', { name: 'Ler postmortem' }).click();
  await expect(page.getByRole('heading', { name: 'O que realmente aconteceu' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inferência pelas ações' })).toBeVisible();
  await expect(page.getByText(/coluna sem índice/)).toBeVisible();
  await expect(page.getByText(/Possibilidade testada: O deploy/)).toBeVisible();
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar plano de execução' }).click();
  await expect(page.getByLabel('Plano de execução')).toContainText(
    'Index Scan Backward using products_pkey',
  );
  await page.getByRole('button', { name: 'Abrir postmortem' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Retomar investigação salva' }).click();
  await page.getByRole('button', { name: 'Ler postmortem' }).click();
  await expect(page.getByText(/Regressão corrigida/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('free mode exposes targeted tools and can end an unresolved investigation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Exploração livre').check();
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  await expect(page.getByRole('button', { name: /Escalar componente/ })).toBeVisible();
  await page.getByRole('button', { name: 'Encerrar investigação' }).click();
  await page.getByRole('button', { name: 'Encerrar e revisar' }).click();
  await expect(page.getByText(/Regressão ainda presente/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'O que realmente aconteceu' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inferência pelas ações' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suas hipóteses' })).toHaveCount(0);
});

test('free investigation installs telemetry, pays overhead, restores choices and targets the responsible operation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('radio', { name: /Incidente 002/ }).check();
  await page.getByLabel('Exploração livre').check();
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  await page.getByRole('button', { name: 'Pausar simulação', exact: true }).click();
  const tools = page.getByRole('navigation', { name: 'Ferramentas de investigação' });
  const step = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await page.getByRole('button', { name: '+30s', exact: true }).click();
      await expect(page.getByRole('button', { name: '+30s', exact: true })).toBeEnabled();
    }
  };
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Buscar plano de execução' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Consultar sessões' })).toHaveCount(0);
  await tools.getByRole('button', { name: 'Endpoints', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Compras por dimensão' })).toHaveCount(0);
  await tools.getByRole('button', { name: 'Observabilidade', exact: true }).click();
  await page
    .getByRole('button', { name: 'Implementar Sessões e esperas do banco', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('60s');
  await step(2);
  await page
    .getByRole('button', { name: 'Implementar Compras por produto e categoria', exact: true })
    .click();
  await step(2);
  await expect(page.getByLabel('Overhead da instrumentação')).toContainText('150 unidades/s');
  await expect(page.getByLabel('Overhead da instrumentação')).toContainText('10 ms');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/free-observability-mobile.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Retomar investigação salva' }).click();
  await tools.getByRole('button', { name: 'Endpoints', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Compras por dimensão' })).toContainText('SKU-101');
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar sessões' })).toBeEnabled();
  await page.getByRole('button', { name: 'Consultar sessões' }).click();
  await expect(page.getByRole('table', { name: 'Sessões do PostgreSQL' })).toContainText('c-6f2');
  await page.getByRole('button', { name: /Implementar cache/ }).click();
  await expect(page.getByRole('button', { name: 'Aplicar intervenção' })).toBeDisabled();
  await page.getByLabel('Alvo de Implementar cache').selectOption('GET /orders');
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  await expect(page.getByRole('status')).toContainText('GET /orders');
  await step(4);
  await page.getByRole('button', { name: /Escalar componente/ }).click();
  await expect(
    page.getByLabel('Alvo de Escalar componente').getByRole('option', { name: /Cache/ }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: /Reiniciar nó/ }).click();
  await expect(
    page.getByLabel('Alvo de Reiniciar nó').getByRole('option', { name: /API · nó 1/ }),
  ).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/free-targets-mobile.png', fullPage: true });
  await page.getByRole('button', { name: /Parar operação/ }).click();
  await page.getByLabel('Alvo de Parar operação').selectOption('inventory-sync');
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  await step(4);
  await expect(page.getByText('Incidente ativo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+30s', exact: true }).click();
  await expect(page.getByRole('button', { name: '+30s', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '+30s', exact: true }).click();
  await page.getByRole('button', { name: 'Ler postmortem' }).click();
  await expect(page.getByText('Implementar cache · GET /orders', { exact: true })).toBeVisible();
  await expect(page.getByText(/Instrumentação mantida: 150 unidades\/s/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile layout remains usable without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Arquitetura Adicionar cache de catálogo/ }).click();
  await expect(page.getByRole('button', { name: 'Aplicar intervenção' })).toBeVisible();
});

test('third incident keeps the diagnosis hidden, recovers and restores its own postmortem', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('radio', { name: /Incidente 003/ }).check();
  await expect(page.getByRole('heading', { name: 'O fim do expediente' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Incidente 003/ })).toBeChecked();
  await expect(
    page.locator('.scenario-option', { has: page.getByRole('radio', { name: /Incidente 003/ }) }),
  ).toContainText('Intermediário');
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  await page.getByRole('button', { name: 'Pausar simulação', exact: true }).click();
  const tools = page.getByRole('navigation', { name: 'Ferramentas de investigação' });
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar sessões', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Sessões do PostgreSQL' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'O que realmente aconteceu' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Parar operação/ }).click();
  await expect(page.getByRole('button', { name: 'Aplicar intervenção' })).toBeDisabled();
  await page.getByLabel('Alvo de Parar operação').selectOption('orders-reconciliation');
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  const step = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await page.getByRole('button', { name: '+30s', exact: true }).click();
      await expect
        .poll(
          async () =>
            (await page.getByRole('button', { name: '+30s', exact: true }).isEnabled()) ||
            (await page.getByRole('button', { name: 'Ler postmortem' }).isVisible()),
        )
        .toBe(true);
      if (await page.getByRole('button', { name: 'Ler postmortem' }).isVisible()) break;
    }
  };
  await step(6);
  await expect(page.getByText('Incidente ativo', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Retomar investigação salva' }).click();
  await expect(page.locator('.incident-id')).toHaveText('INC–003');
  await page.getByRole('button', { name: /Reescrever consulta/ }).click();
  await page.getByLabel('Alvo de Reescrever consulta').selectOption('customer-orders');
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  await step(12);
  await page.getByRole('button', { name: 'Ler postmortem' }).click();
  await expect(page.getByText(/Causa removida/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inferência pelas ações' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Retomar investigação salva' }).click();
  await page.getByRole('button', { name: 'Ler postmortem' }).click();
  await expect(page.getByText(/Causa removida/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('third incident respects free-mode telemetry installation without revealing the report', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /Incidente 003/ }).check();
  await page.getByLabel('Exploração livre').check();
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  await page.getByRole('button', { name: 'Pausar simulação', exact: true }).click();
  const tools = page.getByRole('navigation', { name: 'Ferramentas de investigação' });
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar sessões' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buscar plano de execução' })).toHaveCount(0);
  await tools.getByRole('button', { name: 'Observabilidade', exact: true }).click();
  await page
    .getByRole('button', { name: 'Implementar Sessões e esperas do banco', exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '+30s', exact: true }).click();
    await expect(page.getByRole('button', { name: '+30s', exact: true })).toBeEnabled();
  }
  await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar sessões' }).click();
  await expect(page.getByRole('table', { name: 'Sessões do PostgreSQL' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'O que realmente aconteceu' })).toHaveCount(0);
});

for (const mode of ['guided', 'free'] as const) {
  test(`session intervention opens and scrolls to the picker in ${mode} mode`, async ({ page }) => {
    await page.setViewportSize({ width: mode === 'free' ? 390 : 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('radio', { name: /Incidente 002/ }).check();
    if (mode === 'free') await page.getByLabel('Exploração livre').check();
    await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
    await page.getByRole('button', { name: 'Pausar simulação', exact: true }).click();
    const tools = page.getByRole('navigation', { name: 'Ferramentas de investigação' });
    if (mode === 'free') {
      await tools.getByRole('button', { name: 'Observabilidade', exact: true }).click();
      await page
        .getByRole('button', { name: 'Implementar Sessões e esperas do banco', exact: true })
        .click();
      for (let i = 0; i < 2; i++) {
        await page.getByRole('button', { name: '+30s', exact: true }).click();
        await expect(page.getByRole('button', { name: '+30s', exact: true })).toBeEnabled();
      }
    }
    await tools.getByRole('button', { name: 'Aplicação', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Sessões do PostgreSQL' })).toHaveCount(0);
    await page.getByRole('button', { name: /Encerrar sessão do banco/ }).click();
    const select = page.getByRole('button', {
      name: 'Selecionar sessão na aplicação',
      exact: false,
    });
    const picker = page.getByRole('region', { name: 'Seleção de sessão do banco' });
    for (let i = 0; i < 2; i++) {
      await select.click();
      await expect(picker).toBeFocused();
      await expect(
        picker.getByRole('heading', { name: 'Métricas e sessões do banco' }),
      ).toBeInViewport();
      await expect(picker.getByRole('table', { name: 'Sessões do PostgreSQL' })).toBeVisible();
    }
    await expect(page.getByRole('status')).toHaveCount(0);
    await picker.getByRole('button', { name: 'Encerrar PID 904', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Encerrar sessão 904' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });
}

test('postmortem separates queue drainage from immediate errors and final recovery on mobile', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /Incidente 003/ }).check();
  await page.getByLabel('Exploração livre').check();
  await page.getByRole('button', { name: 'Entrar na sala do incidente' }).click();
  await page.getByRole('button', { name: 'Pausar simulação', exact: true }).click();
  const step = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await page.getByRole('button', { name: '+30s', exact: true }).click();
      await expect
        .poll(
          async () =>
            (await page.getByRole('button', { name: '+30s', exact: true }).isEnabled()) ||
            (await page.getByRole('button', { name: 'Ler postmortem' }).isVisible()),
        )
        .toBe(true);
      if (await page.getByRole('button', { name: 'Ler postmortem' }).isVisible()) break;
    }
  };
  await page.getByRole('button', { name: /Parar operação/ }).click();
  await page.getByLabel('Alvo de Parar operação').selectOption('orders-reconciliation');
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  await step(4);
  await page.getByRole('button', { name: /Aumentar pool de conexões/ }).click();
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  await step(4);
  await page.getByRole('button', { name: /Criar índice/ }).click();
  await page.getByLabel('Alvo de Criar índice').selectOption('customer-orders');
  await page.getByRole('button', { name: 'Aplicar intervenção' }).click();
  await step(14);
  await page.getByRole('button', { name: 'Ler postmortem' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const final = page.getByRole('region', { name: 'Estado final do serviço' });
  await expect(final).toContainText('60s consecutivos');
  const action = page.getByRole('article', { name: /Análise de Criar índice · customer-orders/ });
  await expect(action).toContainText('Antes de iniciar (');
  await expect(action).toContainText('Ao concluir (');
  await expect(action).toContainText('Após 60s de observação (');
  await expect(action).toContainText('fila acumulada');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
