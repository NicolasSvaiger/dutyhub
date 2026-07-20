/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PrefeituraLoginPage } from '../PrefeituraLoginPage';
import { AuthContext, type AuthContextType, type AuthUser } from '../../../contexts/AuthContext';
import { ThemeProvider } from '../../../contexts/ThemeContext';

// react-router-dom navigate — spied via mock module
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function makeAuthValue(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    loading: false,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    pendingChallenge: null,
    challengeUser: null,
    completeNewPassword: vi.fn(),
    clearChallenge: vi.fn(),
    ...overrides,
  };
}

function renderLogin(
  authOverrides: Partial<AuthContextType> = {},
  initialRoute: string = '/prefeitura/login',
) {
  const authValue = makeAuthValue(authOverrides);
  const result = render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <ThemeProvider>
        <AuthContext value={authValue}>
          <PrefeituraLoginPage />
        </AuthContext>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return { ...result, authValue };
}

const gestorUser: AuthUser = {
  userId: 'u-g',
  email: 'gestor@prefeitura.gov.br',
  name: 'Valmir Sousa',
  roles: ['GestorPublico'],
  clinicId: null,
  clinicIds: [],
};

describe('<PrefeituraLoginPage />', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  // ── Renderização ────────────────────────────────────────────────────

  it('renderiza título "Bem-vindo(a) de volta" e ambos os inputs', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: /Bem-vindo/i })).toBeInTheDocument();
    expect(document.getElementById('prefeitura-email')).toBeInTheDocument();
    expect(document.getElementById('prefeitura-password')).toBeInTheDocument();
  });

  it('inputs de email e password possuem ids únicos do portal (evitam conflito com outras telas)', () => {
    renderLogin();
    expect(document.getElementById('prefeitura-email')?.tagName).toBe('INPUT');
    expect(document.getElementById('prefeitura-password')?.tagName).toBe('INPUT');
    // Ids do LoginPage doctor NÃO existem aqui
    expect(document.getElementById('email')).toBeNull();
    expect(document.getElementById('password')).toBeNull();
  });

  it('mostra hero com brand e feature badges', () => {
    renderLogin();
    // Brand aparece no hero (aside com aria-hidden)
    expect(screen.getByText('24p7')).toBeInTheDocument();
    // Feature bullets do hero (pt-BR)
    expect(screen.getByText(/Monitoramento em tempo real/i)).toBeInTheDocument();
    expect(screen.getByText(/Relatórios de frequência/i)).toBeInTheDocument();
    expect(screen.getByText(/Indicadores de desempenho por UPA/i)).toBeInTheDocument();
  });

  it('mostra botões "Esqueci minha senha" e "Acessar portal"', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /Esqueci minha senha/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Acessar portal/i })).toBeInTheDocument();
  });

  // ── Interações do form ─────────────────────────────────────────────

  it('permite digitar email e senha e mantém o valor', async () => {
    renderLogin();
    const user = userEvent.setup();
    const emailInput = document.getElementById('prefeitura-email') as HTMLInputElement;
    const passwordInput = document.getElementById('prefeitura-password') as HTMLInputElement;

    await user.type(emailInput, 'gestor@prefeitura.gov.br');
    await user.type(passwordInput, 'Senha@2026');

    expect(emailInput.value).toBe('gestor@prefeitura.gov.br');
    expect(passwordInput.value).toBe('Senha@2026');
  });

  it('toggle "mostrar senha" alterna type do input password', async () => {
    renderLogin();
    const user = userEvent.setup();
    const passwordInput = document.getElementById('prefeitura-password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: /Mostrar senha/i });
    await user.click(toggleBtn);

    expect(passwordInput.type).toBe('text');
    expect(screen.getByRole('button', { name: /Ocultar senha/i })).toBeInTheDocument();
  });

  it('submissão chama login(email, password) do AuthContext', async () => {
    const { authValue } = renderLogin();
    const user = userEvent.setup();

    await user.type(document.getElementById('prefeitura-email')!, 'gestor@prefeitura.gov.br');
    await user.type(document.getElementById('prefeitura-password')!, 'Senha@2026');
    await user.click(screen.getByRole('button', { name: /Acessar portal/i }));

    await waitFor(() => {
      expect(authValue.login).toHaveBeenCalledWith('gestor@prefeitura.gov.br', 'Senha@2026');
    });
  });

  // ── Tratamento de erro ──────────────────────────────────────────────

  it('mostra erro de credenciais inválidas quando Cognito lança NotAuthorizedException', async () => {
    const loginMock = vi.fn().mockRejectedValue(new Error('NotAuthorizedException: Incorrect username or password'));
    renderLogin({ login: loginMock });
    const user = userEvent.setup();

    await user.type(document.getElementById('prefeitura-email')!, 'x@y.com');
    await user.type(document.getElementById('prefeitura-password')!, 'wrong');
    await user.click(screen.getByRole('button', { name: /Acessar portal/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/E-mail ou senha incorretos/i);
    });
  });

  it('mostra erro de tentativas excedidas quando LimitExceededException', async () => {
    const loginMock = vi.fn().mockRejectedValue(new Error('LimitExceededException: Password attempts exceeded'));
    renderLogin({ login: loginMock });
    const user = userEvent.setup();

    await user.type(document.getElementById('prefeitura-email')!, 'x@y.com');
    await user.type(document.getElementById('prefeitura-password')!, 'wrong');
    await user.click(screen.getByRole('button', { name: /Acessar portal/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Muitas tentativas/i);
    });
  });

  // ── Redirect por role ───────────────────────────────────────────────

  it('redireciona GestorPublico autenticado para /prefeitura', async () => {
    renderLogin({ user: gestorUser, isAuthenticated: true });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/prefeitura', { replace: true });
    });
  });

  it('redireciona GestorPublico com ?tv=1 para /prefeitura/tv', async () => {
    renderLogin({ user: gestorUser, isAuthenticated: true }, '/prefeitura/login?tv=1');
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/prefeitura/tv', { replace: true });
    });
  });

  it('redireciona AdminGlobal autenticado para /admin', async () => {
    const admin: AuthUser = { ...gestorUser, roles: ['AdminGlobal'] };
    renderLogin({ user: admin, isAuthenticated: true });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true });
    });
  });

  it('redireciona Doctor autenticado para /doctor', async () => {
    const doctor: AuthUser = { ...gestorUser, roles: ['Doctor'] };
    renderLogin({ user: doctor, isAuthenticated: true });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/doctor', { replace: true });
    });
  });

  it('não redireciona quando isAuthenticated=false', () => {
    renderLogin();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ── Theme toggle ───────────────────────────────────────────────────

  it('theme toggle alterna data-theme do documento', async () => {
    renderLogin();
    const user = userEvent.setup();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    const toggle = screen.getByRole('button', { name: /ativar.*escuro/i });
    await user.click(toggle);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  // ── Footer ─────────────────────────────────────────────────────────

  it('mostra footer com ano corrente + brand + tagline de acesso restrito', () => {
    renderLogin();
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
    expect(screen.getByText(/Acesso exclusivo para gestores autorizados/i)).toBeInTheDocument();
  });
});
