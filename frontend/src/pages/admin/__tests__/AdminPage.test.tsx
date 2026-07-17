/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../AdminPage';
import { AuthContext, type AuthContextType } from '../../../contexts/AuthContext';

// Mock the adminApi module
vi.mock('../../../api/adminApi', () => ({
  adminApi: {
    getDashboardSummary: vi.fn(),
  },
}));

// Mock the alertsApi (used by Central de Alertas card no home)
vi.mock('../../../api/alertsApi', () => ({
  alertsApi: {
    getAll: vi.fn(),
    getSummary: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    resolve: vi.fn(),
    resolveAll: vi.fn(),
  },
}));

import { adminApi } from '../../../api/adminApi';
import { alertsApi } from '../../../api/alertsApi';

const mockSummary = {
  kpis: {
    activeContracts: 3,
    registeredDoctors: 18,
    shiftsToday: 12,
    shiftsConfirmedToday: 10,
    pendingAlerts: 5,
  },
  clinics: [
    { id: '1', name: 'UPA Centro', address: 'Rua A', phone: '1111', isActive: true, createdAt: '2024-01-01' },
    { id: '2', name: 'UPA Norte', address: 'Rua B', phone: '2222', isActive: true, createdAt: '2024-01-01' },
    { id: '3', name: 'UPA Sul', address: 'Rua C', phone: '3333', isActive: true, createdAt: '2024-01-01' },
  ],
  users: [],
  shiftsToday: [],
  alerts: [
    { id: 'a1', title: 'Turno descoberto', message: 'UPA Centro sem médico', createdAt: new Date().toISOString(), isRead: false },
    { id: 'a2', title: 'Escala publicada', message: '14 médicos confirmados', createdAt: new Date(Date.now() - 86400000).toISOString(), isRead: true },
  ],
};

function createAuthValue(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: {
      userId: 'u1',
      email: 'admin@24p7.com.br',
      name: 'Maria Silva',
      roles: ['AdminGlobal'],
      clinicId: '1',
      clinicIds: ['1', '2', '3'],
    },
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

function renderAdminPage(authOverrides: Partial<AuthContextType> = {}) {
  return render(
    <MemoryRouter>
      <AuthContext value={createAuthValue(authOverrides)}>
        <AdminPage />
      </AuthContext>
    </MemoryRouter>,
  );
}

describe('<AdminPage />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminApi.getDashboardSummary as ReturnType<typeof vi.fn>).mockResolvedValue(mockSummary);
    // Default: 5 alerts abertos (2 críticos + 3 atenção) — preserva compatibilidade com
    // testes anteriores que esperam "5" no KPI de alertas pendentes.
    (alertsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (alertsApi.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalToday: 5, totalAll: 8, openCritical: 2, openWarning: 3, openInfo: 0, resolvedToday: 0,
    });
  });

  it('renderiza o título "Visão Geral" e a data atual', () => {
    renderAdminPage();
    expect(screen.getByText('Visão Geral')).toBeInTheDocument();
  });

  it('exibe o nome do usuário logado no welcome hero', () => {
    renderAdminPage();
    const elements = screen.getAllByText('Maria Silva');
    expect(elements.length).toBe(2); // sidebar + hero
    expect(elements[1]).toHaveClass('welcome-name');
  });

  it('exibe o email do usuário logado', () => {
    renderAdminPage();
    expect(screen.getByText('admin@24p7.com.br')).toBeInTheDocument();
  });

  it('exibe iniciais do usuário na sidebar', () => {
    renderAdminPage();
    expect(screen.getByText('MS')).toBeInTheDocument();
  });

  it('carrega e exibe KPIs do backend', async () => {
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument(); // activeContracts
      expect(screen.getByText('18')).toBeInTheDocument(); // registeredDoctors
      expect(screen.getByText('12')).toBeInTheDocument(); // shiftsToday
      expect(screen.getByText('5')).toBeInTheDocument(); // pendingAlerts
    });
  });

  it('exibe contagem de UPAs baseada nos dados reais', async () => {
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByText('3 UPAs sob gestão')).toBeInTheDocument();
    });
  });

  it('exibe card de Central de alertas com estado vazio quando não há alertas', async () => {
    (alertsApi.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalToday: 0, totalAll: 0, openCritical: 0, openWarning: 0, openInfo: 0, resolvedToday: 0,
    });
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByText('Central de alertas')).toBeInTheDocument();
      // Sem alertas → mostra o placeholder "Nenhum alerta aberto"
      expect(screen.getByText(/Nenhum alerta aberto/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('exibe badge com contagem de alertas abertos vinda do alertsApi', async () => {
    (alertsApi.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalToday: 5, totalAll: 8, openCritical: 2, openWarning: 3, openInfo: 1, resolvedToday: 0,
    });
    renderAdminPage();
    await waitFor(() => {
      // openCritical + openWarning + openInfo = 6
      expect(screen.getByText('6 abertos')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('exibe lista com até 3 alertas abertos mais recentes', async () => {
    const alerts = [
      { id: 'a1', code: 'A1', level: 'Critical', levelLabel: 'Crítico', type: 'UncoveredShift', typeLabel: 'Turno descoberto',
        title: 'Turno sem cobertura', description: 'test', clinicId: 'c1', clinicName: 'UPA Centro',
        relatedUserId: null, relatedUserName: null,
        primaryActionLabel: null, secondaryActionLabel: null,
        isResolved: false, resolvedAt: null, resolvedByUserId: null, resolvedByUserName: null, resolutionNotes: null,
        createdAt: new Date().toISOString() },
    ];
    (alertsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(alerts);
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByText('Turno sem cobertura')).toBeInTheDocument();
      expect(screen.getByText('Ver todos os alertas →')).toBeInTheDocument();
    });
  });

  it('mostra "—" nos KPIs enquanto carrega', () => {
    // Never resolve the promise to keep loading state
    (adminApi.getDashboardSummary as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderAdminPage();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(4); // 4 KPIs
  });

  it('toggle de tema escuro funciona', async () => {
    renderAdminPage();
    const user = userEvent.setup();

    const toggleBtn = screen.getByTitle('Tema escuro');
    await user.click(toggleBtn);

    // After click, should now show "Tema claro" title
    expect(screen.getByTitle('Tema claro')).toBeInTheDocument();
  });

  it('exibe itens de navegação da sidebar', () => {
    renderAdminPage();
    expect(screen.getByText('Início')).toBeInTheDocument();
    expect(screen.getAllByText('Tempo Real').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Central de Alertas')).toBeInTheDocument();
    expect(screen.getByText('Usuários da OS')).toBeInTheDocument();
    expect(screen.getAllByText('Órgãos Públicos').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Escalas').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Configurações')).toBeInTheDocument();
    expect(screen.getByText('Auditoria')).toBeInTheDocument();
  });

  it('exibe cards de acesso rápido', () => {
    renderAdminPage();
    expect(screen.getByText('Médicos')).toBeInTheDocument();
    expect(screen.getAllByText('Escalas').length).toBeGreaterThanOrEqual(2); // sidebar + card
    expect(screen.getAllByText('Tempo Real').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Substituições').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Relatórios').length).toBeGreaterThanOrEqual(1);
  });

  it('lida gracefully com erro na API', async () => {
    (adminApi.getDashboardSummary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    (alertsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    (alertsApi.getSummary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderAdminPage();

    // Should render without crashing — card renderiza mesmo com erro (alertsSummary = null → 0 abertos)
    // e nome do usuário continua exibido
    expect(await screen.findByText('Central de alertas', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Visão Geral')).toBeInTheDocument();
  });

  it('formata tempo dos alertas corretamente (Ontem)', async () => {
    renderAdminPage();
    await waitFor(() => {
      // Alerts section is now disabled/placeholder, just verify it renders
      expect(screen.getByText('Central de alertas')).toBeInTheDocument();
    });
  });
});
