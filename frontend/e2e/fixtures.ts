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
 * Verifica se o usuário está autenticado checando localStorage após login.
 * Útil para assertions pós-login sem depender de UI.
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const token = await page.evaluate(() => localStorage.getItem('plantonhub_token'));
  return !!token;
}

export const test = base;
export { expect };
