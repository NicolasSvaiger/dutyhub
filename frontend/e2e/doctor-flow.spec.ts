import { test, expect, loginAsDoctor } from './fixtures';

test.describe('Fluxo do médico', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDoctor(page);
  });

  test('após login, já está na área profissional e vê os dois botões', async ({ page }) => {
    // O fixture loginAsDoctor já espera pelo redirect pra /doctor
    await expect(page).toHaveURL(/\/doctor/);

    // Saudação no header (nome do usuário do seeder, contém "Dr" ou "Dra.")
    await expect(page.getByText(/Olá.*Dr/i)).toBeVisible();

    // Os dois botões de ação da home ficam visíveis
    await expect(page.getByRole('button', { name: /^Check-in$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Check-out$/i })).toBeVisible();
  });

  test('abre o modal de check-in', async ({ page }) => {
    await page.goto('/doctor');
    await page.getByRole('button', { name: /^Check-in$/i }).click();

    // Modal aparece com título "Realizar Check-In?" (pt-BR)
    await expect(page.getByText(/Realizar Check-In\?/i)).toBeVisible();

    // Espera o modal sair do loading (algum dos estados finais aparece)
    // Pode ser: botão "Confirmar" (tem shift), "Fechar" (vazio/bloqueado),
    // ou a mensagem de bloqueio.
    await expect(
      page.getByRole('button', { name: /^(Confirmar|Fechar|Não)$/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('cancelar o modal fecha sem realizar a ação', async ({ page }) => {
    await page.goto('/doctor');
    await page.getByRole('button', { name: /^Check-in$/i }).click();
    await expect(page.getByText(/Realizar Check-In\?/i)).toBeVisible();

    // Botão de cancelar é "Não" (quando há plantões) ou "Fechar" (estado vazio/bloqueado)
    const cancelBtn = page.getByRole('button', { name: /^(Não|Fechar)$/i });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(page.getByText(/Realizar Check-In\?/i)).not.toBeVisible();
  });

  test('navega até "Plantões" e vê a lista agrupada', async ({ page }) => {
    await page.goto('/doctor');
    // A bottom-nav do médico tem uma aba "Plantões"
    await page.getByRole('button', { name: /Plantões/i }).click();

    // Espera o cabeçalho de algum dos grupos aparecer (API pode demorar no CI)
    await expect(
      page.getByText(/Hoje|Próximos|Passados/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('navega até "Relatórios" e vê o resumo do médico', async ({ page }) => {
    await page.goto('/doctor');
    await page.getByRole('button', { name: /Relatórios/i }).click();

    // Título do card de resumo é traduzido em pt-BR
    await expect(page.getByText(/Resumo/i)).toBeVisible({ timeout: 15_000 });
  });
});
