import { defineConfig, devices } from '@playwright/test';

/**
 * Configuração Playwright para os testes E2E do DutyHub.
 *
 * Roda contra o stack levantado via `docker compose up`:
 *   - API      em http://host.docker.internal:5000
 *   - Frontend em http://host.docker.internal:3000
 *
 * O DatabaseSeeder popula automaticamente o usuário médico
 * `medico@plantonhub.com / Teste@123`, duas clínicas e plantões
 * walk-in — os testes usam esse estado semeado.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://host.docker.internal:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }], ['github']]
    : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Geolocalização de São Paulo (o médico está fazendo check-in na Alpha)
    geolocation: { latitude: -23.5505, longitude: -46.6333 },
    permissions: ['geolocation'],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
