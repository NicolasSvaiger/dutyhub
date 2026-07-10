import { test as base, expect, type Page } from '@playwright/test';

/**
 * Credenciais do médico semeado pelo `DatabaseSeeder` do backend:
 * `medico@plantonhub.com` / `Teste@123`. Está associado a duas clínicas
 * (Alpha e Beta) e tem plantões walk-in de hoje já cadastrados.
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
 * Faz login pela UI e espera o redirect pra /dashboard.
 * Retorna já autenticado.
 */
export async function loginAsDoctor(page: Page): Promise<void> {
  attachDebugListeners(page);
  await page.goto('/login');
  await page.getByRole('textbox', { name: /E-?mail/i }).fill(DOCTOR_CREDENTIALS.email);
  // #password evita conflito com o botão "Mostrar/Ocultar senha" (mesmo texto no acessível)
  await page.locator('#password').fill(DOCTOR_CREDENTIALS.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Médico é profissional → cai direto em /doctor após login (roles.ts:getHomeRouteFor)
  await page.waitForURL(/\/doctor/, { timeout: 15_000 });
}

export const test = base;
export { expect };
