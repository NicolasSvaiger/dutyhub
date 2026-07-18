import { test as base, expect, type Page } from '@playwright/test';

/**
 * Credenciais do médico no Cognito User Pool.
 * Devem corresponder aos usuários criados pelo script cognito-migrate-users
 * com --set-permanent-password (para E2E não precisar lidar com
 * NEW_PASSWORD_REQUIRED challenge).
 */
export const DOCTOR_CREDENTIALS = {
  email: 'medico@plantonhub.com',
  password: 'Teste@123',
} as const;

/**
 * Credenciais do admin global no Cognito. Mesmo padrão de seed que o médico —
 * usuário é criado pelo DatabaseSeeder + script cognito-migrate-users.
 * AdminGlobal é redirecionado pra /admin após login pela AdminLoginPage.
 */
export const ADMIN_CREDENTIALS = {
  email: 'admin@plantonhub.com',
  password: 'Admin@123',
} as const;

/**
 * Credenciais do gestor público (portal Prefeitura). Criado pelo
 * DatabaseSeeder.SeedGestorPublicoAsync e vinculado à Prefeitura Municipal
 * de Santo André via UserPublicOrganRole. Redirecionado pra /prefeitura
 * após login pela PrefeituraLoginPage.
 */
export const PREFEITURA_CREDENTIALS = {
  email: 'gestor@plantonhub.com',
  password: 'Teste@123',
} as const;

/**
 * Ativa listeners de console/erro/rede — quando algo quebra o motivo
 * imprime no output do Playwright, o que ajuda a diagnosticar falhas
 * silenciosas do frontend em CI.
 */
export function attachDebugListeners(page: Page): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[browser ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[pageerror] ${err.message}`);
  });
  page.on('response', (resp) => {
    const url = resp.url();
    if (url.includes('/api/') && resp.status() >= 400) {
      console.log(`[api ${resp.status()}] ${resp.request().method()} ${url}`);
    }
  });
}

/**
 * Faz login pela UI (Cognito SDK) e espera o redirect pra /doctor.
 * Retorna já autenticado.
 *
 * Com Cognito, o login é feito client-side pelo SDK — o Playwright preenche
 * o form e aguarda a navegação normalmente. O SDK faz a chamada ao endpoint
 * Cognito (não ao nosso /api/auth/login).
 */
export async function loginAsDoctor(page: Page): Promise<void> {
  attachDebugListeners(page);
  await page.goto('/login');
  await page.getByRole('textbox', { name: /E-?mail/i }).fill(DOCTOR_CREDENTIALS.email);
  await page.locator('#password').fill(DOCTOR_CREDENTIALS.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Médico é profissional → cai direto em /doctor após login (roles.ts:getHomeRouteFor)
  await page.waitForURL(/\/doctor/, { timeout: 15_000 });
}

/**
 * Faz login como AdminGlobal via /admin/login (tela separada com layout split).
 * Espera o redirect pra /admin (view "home" ativa por padrão).
 *
 * A AdminLoginPage usa o mesmo login() do useAuth, então o SDK Cognito é o
 * mesmo — o layout e a rota de destino é que diferem.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  attachDebugListeners(page);
  await page.goto('/admin/login');
  // AdminLoginPage uses admin-scoped ids and a different submit label
  // than the doctor login page (id="admin-email"/"admin-password",
  // button "Acessar painel"). Getting these wrong causes the earlier
  // timeout at locator.fill('#password') seen in the run for 844b39c.
  await page.locator('#admin-email').fill(ADMIN_CREDENTIALS.email);
  await page.locator('#admin-password').fill(ADMIN_CREDENTIALS.password);
  await page.getByRole('button', { name: /Acessar painel/i }).click();
  // AdminGlobal → cai em /admin (AdminLoginPage.useEffect redireciona por role)
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15_000 });
}

/**
 * Faz login como Gestor Público via /prefeitura/login. A PrefeituraLoginPage
 * tem ids escopados (#prefeitura-email/#prefeitura-password) e botão "Acessar
 * portal", diferente das outras telas de login. Redirecionamento é feito no
 * useEffect da própria página pelo useAuth: gestor cai em /prefeitura, gestor
 * com ?tv=1 na URL cai em /prefeitura/tv.
 *
 * @param opts.tv Se true, adiciona ?tv=1 no login pra ir direto ao Modo TV.
 */
export async function loginAsPrefeitura(page: Page, opts: { tv?: boolean } = {}): Promise<void> {
  attachDebugListeners(page);
  const url = opts.tv ? '/prefeitura/login?tv=1' : '/prefeitura/login';
  await page.goto(url);
  await page.locator('#prefeitura-email').fill(PREFEITURA_CREDENTIALS.email);
  await page.locator('#prefeitura-password').fill(PREFEITURA_CREDENTIALS.password);
  await page.getByRole('button', { name: /Acessar portal/i }).click();
  const target = opts.tv ? /\/prefeitura\/tv/ : /\/prefeitura(?!\/login)/;
  await page.waitForURL(target, { timeout: 15_000 });
}

/**
 * Verifica se o usuário está autenticado checando localStorage após login.
 * Útil para assertions pós-login sem depender de UI.
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const token = await page.evaluate(() => localStorage.getItem('plantonhub_token'));
  return !!token;
}

export const test = base;
export { expect };
