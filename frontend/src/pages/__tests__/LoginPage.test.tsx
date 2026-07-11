/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { LoginPage } from '../LoginPage';
import { AuthContext, type AuthContextType } from '../../contexts/AuthContext';
import { ThemeProvider } from '../../contexts/ThemeContext';

// Login is handled by Cognito SDK via AuthContext; we provide a mock context
// directly so no API module mocking is needed.

function renderLogin() {
  const authValue: AuthContextType = {
    user: null,
    token: null,
    isAuthenticated: false,
    loading: false,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    pendingChallenge: null,
    challengeUser: null,
    clearChallenge: vi.fn(),
  };

  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthContext value={authValue}>
          <LoginPage />
        </AuthContext>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('<LoginPage />', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renderiza título "Bem-vindo(a) de volta" e os dois inputs', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: /Bem-vindo/i })).toBeInTheDocument();
    // Input do email (role=textbox) — inclusivo com hífen ("E-mail")
    expect(
      screen.getByRole('textbox', { name: /E-?mail/i }),
    ).toBeInTheDocument();
    // Input de senha (não é role=textbox) — encontra pelo id
    expect(document.getElementById('password')).toBeInTheDocument();
  });

  it('inicia em light mode e o toggle alterna para dark', async () => {
    renderLogin();
    const user = userEvent.setup();

    // O ThemeProvider aplica `data-theme` no <html> — sem stored preference,
    // matchMedia (stub sempre retorna matches:false) => começa light.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // Botão de toggle está visível na tela
    const toggleBtn = screen.getByRole('button', {
      name: i18n.t('doctor.theme.toActivateDark'),
    });
    expect(toggleBtn).toBeInTheDocument();

    // Clica → tema vira dark
    await user.click(toggleBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Aria-label atualiza pra "ativar claro"
    expect(
      screen.getByRole('button', {
        name: i18n.t('doctor.theme.toActivateLight'),
      }),
    ).toBeInTheDocument();

    // Persiste no localStorage
    expect(window.localStorage.getItem('plantonhub_theme')).toBe('dark');
  });

  it('mostra botão "Esqueci minha senha" e link "Entrar"', () => {
    renderLogin();
    expect(
      screen.getByRole('button', { name: i18n.t('login.forgot') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n.t('login.submit') }),
    ).toBeInTheDocument();
  });

  it('clicar em "Esqueci minha senha" navega para /forgot-password', async () => {
    // Ao clicar, o navigate() é chamado. Com MemoryRouter não temos como
    // checar window.location, mas podemos verificar que o botão não mostra
    // um alert (comportamento antigo removido) — a navegação real é testada no E2E.
    renderLogin();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: i18n.t('login.forgot') }),
    );

    // Não deve aparecer nenhum alert (comportamento antigo era mostrar forgotHint)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('exibe a marca configurável (BRAND.name = 24p7)', () => {
    renderLogin();
    // O nome aparece no hero (aside com aria-hidden). É desktop-only mas
    // o CSS `display: none` do mobile só cai via media query — em jsdom
    // vem visível de qualquer forma.
    expect(screen.getByText('24p7')).toBeInTheDocument();
  });
});
