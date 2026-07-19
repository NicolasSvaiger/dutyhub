import {
  test,
  expect,
  loginAsPrefeitura,
  loginAsAdmin,
  attachDebugListeners,
  isAuthenticated,
  PREFEITURA_CREDENTIALS,
} from './fixtures';

test.describe('Portal Prefeitura — fluxos básicos', () => {
  test('gestor faz login via Cognito e cai em /prefeitura com Início ativo', async ({ page }) => {
    attachDebugListeners(page);
    await page.goto('/prefeitura/login');

    // Título do form (não colidir com heading do hero — pega o do form-side)
    await expect(page.getByRole('heading', { name: /Bem-vindo/i })).toBeVisible();

    await page.locator('#prefeitura-email').fill(PREFEITURA_CREDENTIALS.email);
    await page.locator('#prefeitura-password').fill(PREFEITURA_CREDENTIALS.password);
    await page.getByRole('button', { name: /Acessar portal/i }).click();

    // Login OK → redirect pra /prefeitura ou alerta de erro.
    await Promise.race([
      page.waitForURL(/\/prefeitura(?!\/login)/, { timeout: 15_000 }),
      page.getByRole('alert').waitFor({ state: 'visible', timeout: 15_000 }).then(async () => {
        const err = await page.getByRole('alert').innerText();
        throw new Error(`Login exibiu erro: ${err}`);
      }),
    ]);

    await expect(page).toHaveURL(/\/prefeitura(?!\/login)/);
    expect(await isAuthenticated(page)).toBe(true);

    // "Início" no nav aparece com aria-current="page" após o mount
    await expect(
      page.getByRole('button', { name: /Início/i }).first(),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('clicar em "Indicadores" carrega a view de KPIs', async ({ page }) => {
    await loginAsPrefeitura(page);

    // 1º botão "Indicadores" é o nav item da sidebar.
    await page.getByRole('button', { name: /Indicadores/i }).first().click();

    // Filtro from/to aparece + botão Aplicar → confirma que PrefeituraKpis montou.
    await expect(page.locator('#kpis-from')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Aplicar/i })).toBeVisible();
  });

  test('clicar em "Escalas" carrega a view de Escalas', async ({ page }) => {
    await loginAsPrefeitura(page);
    await page.getByRole('button', { name: /Escalas/i }).first().click();

    // Badge "Somente visualização" + navegação de semana — indicadores da
    // nova view Escalas (grade semanal UPA x dia x turno).
    await expect(page.getByText(/Somente visualização/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^Hoje$/i })).toBeVisible();
  });

  test('clicar em "Frequência" carrega a view com botões de export', async ({ page }) => {
    await loginAsPrefeitura(page);
    await page.getByRole('button', { name: /Frequência/i }).first().click();

    // Frequência tem inputs próprios + botões PDF/XLSX no filter action bar.
    await expect(page.locator('#freq-from')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Exportar PDF/i })).toBeVisible();
  });

  test('clicar em "Tempo Real" carrega totalizadores com auto-refresh', async ({ page }) => {
    await loginAsPrefeitura(page);
    await page.getByRole('button', { name: /Tempo Real/i }).first().click();

    // Título "Situação em tempo real" + pelo menos um totalCard visível.
    await expect(page.getByText(/Situação em tempo real/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/UPAs monitoradas/i)).toBeVisible();
  });

  test('clicar em "Ausências" mostra tabela e coluna Ação (Acionar OS)', async ({ page }) => {
    await loginAsPrefeitura(page);
    await page.getByRole('button', { name: /^Ausências$/i }).first().click();

    // A view sempre monta o form de filtros — verifica pelo ID único.
    await expect(page.locator('#aus-from')).toBeVisible({ timeout: 15_000 });

    // Se a tabela tem linhas, a coluna Ação aparece com header "Ação". Se o
    // seed atual tem 0 ausências pra hoje, vemos o empty state em vez disso —
    // aceitar qualquer um dos dois pra não depender do estado do seed.
    const acao = page.getByRole('columnheader', { name: /^Ação$/i });
    const empty = page.getByText(/Sem ausências no período/i);
    await Promise.race([
      acao.waitFor({ state: 'visible', timeout: 10_000 }),
      empty.waitFor({ state: 'visible', timeout: 10_000 }),
    ]);
  });

  test('acessar /prefeitura sem login redireciona para /prefeitura/login', async ({ page }) => {
    // ProtectedRoute redireciona quando não há sessão. Vamos direto na URL
    // protegida sem autenticar antes.
    await page.goto('/prefeitura');
    await expect(page).toHaveURL(/\/prefeitura\/login|\/login/, { timeout: 10_000 });
  });

  test('admin autenticado tenta /prefeitura e vê Acesso negado', async ({ page }) => {
    await loginAsAdmin(page);
    // Após login como AdminGlobal, tenta acessar /prefeitura direto.
    // ProtectedRoute (requiredRoles=['GestorPublico']) não redireciona —
    // mantém a URL e troca o conteúdo pela tela "Acesso negado" (mesmo
    // comportamento usado nas demais rotas protegidas por role: /clinics,
    // /users, /doctor, /admin). Ver src/components/ProtectedRoute.tsx.
    await page.goto('/prefeitura');
    await expect(page.getByRole('heading', { name: /Acesso negado/i })).toBeVisible({ timeout: 10_000 });
  });

  test('botão "Painel TV" abre /prefeitura/tv em nova aba', async ({ page, context }) => {
    await loginAsPrefeitura(page);

    // "Painel TV" é o único botão com esse label exato (na seção Principal).
    const [tvPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 10_000 }),
      page.getByRole('button', { name: /^Painel TV$/i }).click(),
    ]);

    await tvPage.waitForLoadState('domcontentloaded');
    expect(tvPage.url()).toContain('/prefeitura/tv');
    await tvPage.close();
  });
});
