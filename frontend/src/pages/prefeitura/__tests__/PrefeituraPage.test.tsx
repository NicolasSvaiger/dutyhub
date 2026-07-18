/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PrefeituraPage } from '../PrefeituraPage';
import { AuthContext, type AuthContextType, type AuthUser } from '../../../contexts/AuthContext';
import { ThemeProvider } from '../../../contexts/ThemeContext';

// Mock the prefeituraApi module — Welcome + Kpis (sub-views) fazem fetch no mount.
vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getDashboard: vi.fn(),
    getKpis: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const gestor: AuthUser = {
  userId: 'u-g',
  email: 'valmir@prefeitura.gov.br',
  name: 'Valmir Sousa',
  roles: ['GestorPublico'],
  clinicId: null,
  clinicIds: [],
};

function makeAuthValue(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: gestor,
    token: 'fake-token',
    isAuthenticated: true,
    loading: false,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    pendingChallenge: null,
    challengeUser: null,
    clearChallenge: vi.fn(),
    ...overrides,
  };
}

function renderPage(authOverrides: Partial<AuthContextType> = {}) {
  const authValue = makeAuthValue(authOverrides);
  const result = render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthContext value={authValue}>
          <PrefeituraPage />
        </AuthContext>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return { ...result, authValue };
}

describe('<PrefeituraPage />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Welcome faz getDashboard no mount — mock com resolve default
    (prefeituraApi.getDashboard as ReturnType<typeof vi.fn>).mockResolvedValue({
      periodLabel: 'Hoje',
      todayComplianceRate: 92.5,
      todayExpectedShifts: 40,
      todayCoveredShifts: 37,
      todayLateEvents: 2,
      todayOpenAbsences: 1,
      clinicCount: 4,
      recentAlerts: [],
    });
    (prefeituraApi.getKpis as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: '2026-06-17',
      to: '2026-07-17',
      globalComplianceRate: 90,
      totalExpectedShifts: 100,
      totalCoveredShifts: 90,
      totalAbsences: 5,
      totalLateEvents: 5,
      averageLateMinutes: 12.5,
      substitutionRate: 8,
      byClinic: [],
    });
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  // ── Sidebar ────────────────────────────────────────────────────────

  it('renderiza sidebar com brand + tagline + module label', () => {
    renderPage();
    expect(screen.getByText('24p7')).toBeInTheDocument();
    expect(screen.getByText(/Órgão Público/i)).toBeInTheDocument();
    expect(screen.getByText(/Portal Prefeitura/i)).toBeInTheDocument();
  });

  it('renderiza 8 nav items da section "Principal"', () => {
    renderPage();
    const labels = ['Início', 'Indicadores', 'Escalas', 'Frequência', 'Atrasos', 'Ausências', 'Histórico', 'Tempo Real'];
    for (const label of labels) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('nav item "Início" começa ativo (aria-current="page")', () => {
    renderPage();
    const homeBtn = screen.getAllByRole('button', { name: /Início/i })[0];
    expect(homeBtn).toHaveAttribute('aria-current', 'page');
  });

  // ── activeView switching ──────────────────────────────────────────

  it('clicar em "Indicadores" muda activeView e renderiza PrefeituraKpis', async () => {
    renderPage();
    const user = userEvent.setup();
    // Aguarda o Welcome renderizar primeiro (fetch inicial)
    await waitFor(() => {
      expect(prefeituraApi.getDashboard).toHaveBeenCalled();
    });

    // Clica no botão "Indicadores" da sidebar
    const navBtns = screen.getAllByRole('button', { name: /Indicadores/i });
    await user.click(navBtns[0]);

    await waitFor(() => {
      expect(prefeituraApi.getKpis).toHaveBeenCalled();
    });
    // Kpis renderiza filtro "Aplicar"
    expect(screen.getByRole('button', { name: /Aplicar/i })).toBeInTheDocument();
  });

  it('clicar em "Escalas" mostra ComingSoon placeholder', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(prefeituraApi.getDashboard).toHaveBeenCalled();
    });

    const escalasBtn = screen.getAllByRole('button', { name: /Escalas/i })[0];
    await user.click(escalasBtn);

    expect(screen.getByText(/Em breve/i)).toBeInTheDocument();
  });

  it('nav item ativo muda de "Início" para "Indicadores" ao clicar', async () => {
    renderPage();
    const user = userEvent.setup();

    const kpisBtn = screen.getAllByRole('button', { name: /Indicadores/i })[0];
    await user.click(kpisBtn);

    expect(kpisBtn).toHaveAttribute('aria-current', 'page');
    const homeBtn = screen.getAllByRole('button', { name: /Início/i })[0];
    expect(homeBtn).not.toHaveAttribute('aria-current');
  });

  // ── Topbar ─────────────────────────────────────────────────────────

  it('topbar mostra título da view ativa', async () => {
    renderPage();
    const user = userEvent.setup();

    // Topbar tem "Início" inicial (mesmo texto do nav)
    const kpisBtn = screen.getAllByRole('button', { name: /Indicadores/i })[0];
    await user.click(kpisBtn);

    // Topbar acompanha
    const titles = screen.getAllByText(/Indicadores/i);
    expect(titles.length).toBeGreaterThanOrEqual(2); // sidebar + topbar
  });

  // ── User info ──────────────────────────────────────────────────────

  it('mostra nome do usuário e iniciais no footer da sidebar', () => {
    renderPage();
    // "Valmir Sousa" aparece na sidebar (footer) e no hero do Welcome — 2 ocorrências
    expect(screen.getAllByText('Valmir Sousa').length).toBeGreaterThanOrEqual(1);
    // Iniciais VS aparecem só no avatar da sidebar
    expect(screen.getByText('VS')).toBeInTheDocument();
    expect(screen.getAllByText(/Gestor.*Público/i).length).toBeGreaterThanOrEqual(1);
  });

  it('fallback pra defaultUserName quando user.name é null', () => {
    renderPage({ user: { ...gestor, name: null } });
    // "Gestor(a)" (defaultUserName) aparece na sidebar (footer) e no hero do Welcome
    expect(screen.getAllByText(/^Gestor\(a\)$/).length).toBeGreaterThanOrEqual(1);
  });

  // ── Logout ─────────────────────────────────────────────────────────

  it('clicar em botão de logout chama logout do AuthContext', async () => {
    // window.location.href write breaks jsdom; stub it
    const originalLocation = window.location;
    // @ts-expect-error jsdom Location is writable via delete + reassign
    delete window.location;
    // @ts-expect-error minimal stub sufficient for the test assertion
    window.location = { ...originalLocation, href: '', assign: vi.fn(), replace: vi.fn() };

    const { authValue } = renderPage();
    const user = userEvent.setup();

    const logoutBtn = screen.getByRole('button', { name: /Sair/i });
    await user.click(logoutBtn);

    expect(authValue.logout).toHaveBeenCalled();

    // Restore
    // @ts-expect-error restore original location handle
    window.location = originalLocation;
  });

  // ── Mobile drawer ──────────────────────────────────────────────────

  it('hamburger button possui aria-label "Abrir menu"', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Abrir menu/i })).toBeInTheDocument();
  });

  it('clicar no hamburger abre a sidebar (aria-expanded=true)', async () => {
    renderPage();
    const user = userEvent.setup();

    const hamburger = screen.getByRole('button', { name: /Abrir menu/i });
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');

    await user.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');
  });

  it('overlay aparece quando sidebar aberta e fecha ao clicar', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Abrir menu/i }));

    const overlay = screen.getByRole('button', { name: /Fechar menu/i });
    expect(overlay).toBeInTheDocument();

    await user.click(overlay);
    expect(screen.queryByRole('button', { name: /Fechar menu/i })).not.toBeInTheDocument();
  });

  it('clicar em nav item fecha o drawer mobile', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Abrir menu/i }));
    expect(screen.getByRole('button', { name: /Fechar menu/i })).toBeInTheDocument();

    const kpisBtn = screen.getAllByRole('button', { name: /Indicadores/i })[0];
    await user.click(kpisBtn);

    expect(screen.queryByRole('button', { name: /Fechar menu/i })).not.toBeInTheDocument();
  });

  // ── Modo TV ────────────────────────────────────────────────────────

  it('clicar em "Modo TV" abre nova aba em /prefeitura/tv', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPage();
    const user = userEvent.setup();

    // "Modo TV" está na seção "Monitoramento" (não conflita com "Modo TV" no
    // topbar porque a section aparece separada)
    const tvBtn = screen.getByRole('button', { name: /^Modo TV$/i });
    await user.click(tvBtn);

    expect(openSpy).toHaveBeenCalledWith('/prefeitura/tv', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });
});
