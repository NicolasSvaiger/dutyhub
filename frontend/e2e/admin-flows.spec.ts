import { test, expect, loginAsAdmin, isAuthenticated } from './fixtures';

/**
 * Smoke tests for the Admin OS surface. The 5 top-priority views
 * (Início/Dashboard, Médicos, Escalas, UPAs, Tempo Real) are covered
 * by "the sidebar link toggles to active, the view renders without
 * throwing" assertions.
 *
 * Deliberately NOT covering the create flows — the admin views mutate
 * server state (clinic, professional, shift creation) and E2E state
 * cleanup would either need a fresh Postgres per run or transactional
 * rollback plumbing we don't have. Vitest already covers the drawer/
 * form logic in isolation. What this suite catches is regressions in
 * routing, auth-guarded rendering, and cross-view data loading — the
 * things unit tests can't see.
 */
test.describe('Admin OS — smoke das telas principais', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('após login, admin vê a home com sidebar e o item Início ativo', async ({ page }) => {
    // AdminPage state-based navigation: URL permanece /admin, o "activeView"
    // interno vira 'home' e o link "Início" recebe .active.
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // Sessão persistida
    expect(await isAuthenticated(page)).toBe(true);

    // Sidebar visível (o layout admin não usa o header top do AppLayout —
    // tem seu próprio aside com nav-item elements)
    const inicioLink = page.locator('.nav-item', { hasText: /^Início/ });
    await expect(inicioLink).toBeVisible({ timeout: 15_000 });
    await expect(inicioLink).toHaveClass(/active/);

    // Confirma que a AdminPage renderizou (o layout tem #adm-root wrapper)
    await expect(page.locator('#adm-root')).toBeVisible();
  });

  test('navega para Médicos / Enfermeiros e a tabela carrega', async ({ page }) => {
    await page.locator('.nav-item', { hasText: /Médicos.*Enfermeiros/ }).click();

    // Link fica ativo
    await expect(page.locator('.nav-item', { hasText: /Médicos.*Enfermeiros/ }))
      .toHaveClass(/active/);

    // AdminMedicos tem o page-title "Equipe Médica"
    await expect(page.getByText(/Equipe Médica/i)).toBeVisible({ timeout: 15_000 });

    // E o botão de criar novo
    await expect(page.getByRole('button', { name: /Novo profissional/i })).toBeVisible();
  });

  test('navega para Escalas e o grid semanal aparece', async ({ page }) => {
    await page.locator('.nav-item', { hasText: /^Escalas$/ }).click();
    await expect(page.locator('.nav-item', { hasText: /^Escalas$/ }))
      .toHaveClass(/active/);

    // AdminEscalas renderiza um grid semanal — as siglas dos dias da semana
    // (Dom, Seg, Ter...) sempre aparecem no header do grid.
    await expect(page.getByText(/Seg/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Ter/i).first()).toBeVisible();
  });

  test('navega para Unidades (UPAs) e a lista de UPAs aparece', async ({ page }) => {
    await page.locator('.nav-item', { hasText: /Unidades \(UPAs\)/ }).click();
    await expect(page.locator('.nav-item', { hasText: /Unidades \(UPAs\)/ }))
      .toHaveClass(/active/);

    // AdminUpas renderiza cards de UPAs com nome. Depois do seed sempre existe
    // pelo menos "Clínica Alpha" ou "UPA" no texto. Usa regex ampla para não
    // depender do nome exato do seed em ambientes que rebatizam.
    await expect(page.getByText(/UPA|Clínica/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('navega para Tempo Real e o painel ao vivo carrega', async ({ page }) => {
    await page.locator('.nav-item', { hasText: /Tempo Real/ }).click();
    await expect(page.locator('.nav-item', { hasText: /Tempo Real/ }))
      .toHaveClass(/active/);

    // AdminTempoReal tem um relógio que atualiza a cada segundo — só o fato
    // de ter horário no formato HH:MM na tela confirma que a view renderizou.
    // Padrão amplo pra não travar em locales com "12:34" vs "12h34".
    await expect(page.getByText(/\d{1,2}[:h]\d{2}/).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Admin OS — proteção de rota', () => {
  test('acessar /admin sem login redireciona para /login', async ({ page }) => {
    // Garante que não há token do teste anterior
    await page.context().clearCookies();
    await page.goto('/admin');
    // ProtectedRoute com requiredRoles=['AdminGlobal', 'AdminClinica'] manda pra /login
    await expect(page).toHaveURL(/\/login/);
  });
});
