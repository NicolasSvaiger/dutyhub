import { test, expect, DOCTOR_CREDENTIALS, loginAsDoctor, attachDebugListeners, isAuthenticated } from './fixtures';

test.describe('Autenticação (Cognito)', () => {
  test('médico faz login via Cognito SDK e cai direto na área profissional', async ({ page }) => {
    attachDebugListeners(page);
    await page.goto('/login');
    // O layout tem o título "Bem-vindo(a) de volta" como heading do form
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
    // Token armazenado no localStorage
    expect(await isAuthenticated(page)).toBe(true);
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
    // Navega para a view com header visível para acessar o botão Sair
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login/);
    // Token removido do localStorage
    expect(await isAuthenticated(page)).toBe(false);
  });

  test('link "Esqueci minha senha" navega para /forgot-password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Esqueci/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole('heading', { name: /Recuperar senha/i })).toBeVisible();
  });

  test('página de recuperação de senha exibe formulário de email', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /Recuperar senha/i })).toBeVisible();
    await expect(page.getByLabel(/E-?mail/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Enviar código/i })).toBeVisible();
    // Link para voltar ao login
    await expect(page.getByRole('link', { name: /Voltar ao login/i })).toBeVisible();
  });
});
