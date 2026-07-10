import { test, expect, DOCTOR_CREDENTIALS, loginAsDoctor, attachDebugListeners } from './fixtures';

test.describe('Autenticação', () => {
  test('API /auth/login aceita credenciais do médico semeado (smoke)', async ({ request }) => {
    // Sanity check: se essa quebrar, o problema é backend/seed e não o frontend.
    const response = await request.post('/api/auth/login', {
      data: DOCTOR_CREDENTIALS,
    });
    expect(response.status(), await response.text()).toBe(200);
    const body = await response.json();
    expect(body.token).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
  });

  test('médico faz login e cai direto na área profissional', async ({ page }) => {
    attachDebugListeners(page);
    await page.goto('/login');
    // O novo layout tem o título "Bem-vindo(a) de volta" como heading do form
    await expect(page.getByRole('heading', { name: /Bem-vindo/i })).toBeVisible();

    await page.getByRole('textbox', { name: /E-?mail/i }).fill(DOCTOR_CREDENTIALS.email);
    await page.locator('#password').fill(DOCTOR_CREDENTIALS.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Se o login der erro, mostra o alerta antes do timeout — pega esse caso.
    await Promise.race([
      page.waitForURL(/\/doctor/, { timeout: 15_000 }),
      page.getByRole('alert').waitFor({ state: 'visible', timeout: 15_000 }).then(async () => {
        const errText = await page.getByRole('alert').innerText();
        throw new Error(`Login exibiu erro: ${errText}`);
      }),
    ]);

    // Profissional é levado direto pra /doctor (não passa por /dashboard)
    await expect(page).toHaveURL(/\/doctor/);
    // O email do médico aparece no header do app (banner) após o login
    await expect(
      page.getByRole('banner').getByText(DOCTOR_CREDENTIALS.email),
    ).toBeVisible();
  });

  test('login com senha inválida exibe alerta e mantém em /login', async ({ page }) => {
    attachDebugListeners(page);
    await page.goto('/login');
    await page.getByRole('textbox', { name: /E-?mail/i }).fill(DOCTOR_CREDENTIALS.email);
    await page.locator('#password').fill('senha-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('acessar /doctor sem login redireciona para /login', async ({ page }) => {
    await page.goto('/doctor');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout limpa a sessão e volta pra /login', async ({ page }) => {
    await loginAsDoctor(page);
    // O médico cai em /doctor, onde a tela full-screen cobre o header do
    // AppLayout — navegamos para o dashboard antes de acionar o "Sair".
    // (No app real o profissional faz logout pela tela de Ajustes; esse
    // teste cobre só o fluxo de header, complementar.)
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login/);
    // Header do app é escondido quando não autenticado
    await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
  });
});
