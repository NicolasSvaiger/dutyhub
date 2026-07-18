import { test, expect, loginAsPrefeitura, attachDebugListeners } from './fixtures';

test.describe('Portal Prefeitura — Modo TV', () => {
  test('fullscreen renderiza brand, relógio e totalizadores', async ({ page }) => {
    await loginAsPrefeitura(page, { tv: true });

    // Após redirect pro /prefeitura/tv, os elementos-chave do display estão visíveis.
    await expect(page).toHaveURL(/\/prefeitura\/tv/);

    // Brand 24p7 no cabeçalho (mesmo texto que o hero da login, mas aqui vive
    // no header da TV — o teste garante que renderizou).
    await expect(page.getByText('24p7').first()).toBeVisible({ timeout: 15_000 });

    // Tagline do modo TV (i18n prefeitura.tv.tagline)
    await expect(page.getByText(/Monitoramento em tempo real/i).first()).toBeVisible();

    // Totalizadores: pelo menos os 4 labels aparecem.
    await expect(page.getByText(/UPAs/i).first()).toBeVisible();
    await expect(page.getByText(/Previstos/i).first()).toBeVisible();
    await expect(page.getByText(/Presentes/i).first()).toBeVisible();
    await expect(page.getByText(/Ausentes/i).first()).toBeVisible();

    // Relógio wall-clock em formato HH:MM (o clock tick de 1s garante renderização).
    await expect(page.getByText(/^\d{1,2}:\d{2}$/).first()).toBeVisible({ timeout: 5_000 });
  });

  test('polling faz refetch do endpoint /prefeitura/realtime em ~20s', async ({ page }) => {
    let realtimeCalls = 0;
    page.on('response', (resp) => {
      if (resp.url().includes('/prefeitura/realtime')) {
        realtimeCalls++;
      }
    });

    await loginAsPrefeitura(page, { tv: true });

    // Espera o primeiro fetch acontecer (mount).
    await expect.poll(() => realtimeCalls, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    const initial = realtimeCalls;

    // O polling é a cada 20s no PrefeituraTvMode. Damos 30s de folga pra
    // absorver latência de rede em CI (evita flakiness perto do limite).
    await expect.poll(() => realtimeCalls, { timeout: 30_000 }).toBeGreaterThan(initial);
  });

  test('acessar /prefeitura/tv sem login redireciona pra /prefeitura/login', async ({ page }) => {
    // /prefeitura/tv é protegida por role [GestorPublico]. Sem sessão o
    // ProtectedRoute redireciona. Aceitamos qualquer variante de login
    // (?tv=1 seria o ideal, mas o comportamento do ProtectedRoute
    // atualmente redireciona pra /prefeitura/login sem query).
    attachDebugListeners(page);
    await page.goto('/prefeitura/tv');
    await expect(page).toHaveURL(/\/prefeitura\/login|\/login/, { timeout: 10_000 });
  });
});
