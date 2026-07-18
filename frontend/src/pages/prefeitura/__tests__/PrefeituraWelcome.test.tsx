/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PrefeituraWelcome } from '../PrefeituraWelcome';
import { AuthContext, type AuthContextType, type AuthUser } from '../../../contexts/AuthContext';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getDashboard: vi.fn(),
    getRealtime: vi.fn(),
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

const mockDashboard = {
  periodLabel: 'Hoje · 17/07/2026',
  todayComplianceRate: 92.5,
  todayExpectedShifts: 40,
  todayCoveredShifts: 37,
  todayLateEvents: 2,
  todayOpenAbsences: 1,
  clinicCount: 4,
  recentAlerts: [
    { id: 'a1', code: 'AUS-001', level: 'critical', title: 'Ausência sem cobertura', clinicName: 'UPA Centro' },
    { id: 'a2', code: 'ATR-002', level: 'warning', title: 'Check-in atrasado', clinicName: 'UPA Norte' },
    { id: 'a3', code: 'INFO-003', level: 'info', title: 'Escala publicada', clinicName: null },
  ],
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

function renderWelcome(authOverrides: Partial<AuthContextType> = {}) {
  return render(
    <AuthContext value={makeAuthValue(authOverrides)}>
      <PrefeituraWelcome onNavigate={vi.fn()} onOpenTvMode={vi.fn()} />
    </AuthContext>,
  );
}

describe('<PrefeituraWelcome />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getDashboard as ReturnType<typeof vi.fn>).mockResolvedValue(mockDashboard);
    // getRealtime alimenta a faixa "Status das UPAs agora" — pendente
    // indefinidamente por padrão (a maioria dos testes não depende dela);
    // testes que precisam da faixa resolvida usam mockResolvedValue explícito.
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
  });

  it('chama getDashboard() no mount', async () => {
    renderWelcome();
    await waitFor(() => {
      expect(prefeituraApi.getDashboard).toHaveBeenCalledTimes(1);
    });
  });

  it('mostra nome do usuário e email no hero', async () => {
    renderWelcome();
    await waitFor(() => expect(screen.getByText('Valmir Sousa')).toBeInTheDocument());
    expect(screen.getByText('valmir@prefeitura.gov.br')).toBeInTheDocument();
  });

  it('renderiza KPI compliance com valor formatado (92.5%)', async () => {
    renderWelcome();
    await waitFor(() => expect(screen.getByText('92.5%')).toBeInTheDocument());
  });

  it('renderiza KPI coberto / previsto (37/40)', async () => {
    renderWelcome();
    await waitFor(() => expect(screen.getByText('37/40')).toBeInTheDocument());
  });

  it('renderiza KPIs late e ausências', async () => {
    renderWelcome();
    await waitFor(() => {
      expect(screen.getByText(/Atrasos hoje/i)).toBeInTheDocument();
      expect(screen.getByText(/Ausências abertas/i)).toBeInTheDocument();
    });
    // Values are simple numbers
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renderiza lista de alertas recentes com título + código + clínica', async () => {
    renderWelcome();
    await waitFor(() => {
      expect(screen.getByText('Ausência sem cobertura')).toBeInTheDocument();
    });
    expect(screen.getByText(/AUS-001.*UPA Centro/)).toBeInTheDocument();
    expect(screen.getByText(/ATR-002.*UPA Norte/)).toBeInTheDocument();
  });

  it('alerta sem clinicName mostra "Global" como fallback', async () => {
    renderWelcome();
    await waitFor(() => {
      expect(screen.getByText(/INFO-003.*Global/)).toBeInTheDocument();
    });
  });

  it('renderiza empty state quando recentAlerts é vazio', async () => {
    (prefeituraApi.getDashboard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockDashboard,
      recentAlerts: [],
    });
    renderWelcome();
    await waitFor(() => {
      expect(screen.getByText(/Sem alertas abertos/i)).toBeInTheDocument();
    });
  });

  it('mostra erro NO_ORGAN_CONTEXT quando backend responde 403', async () => {
    (prefeituraApi.getDashboard as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('NO_ORGAN_CONTEXT'),
    );
    renderWelcome();
    await waitFor(() => {
      expect(screen.getByText(/não está vinculada a um órgão/i)).toBeInTheDocument();
    });
  });

  it('mostra erro genérico quando fetch falha por outro motivo', async () => {
    (prefeituraApi.getDashboard as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error'),
    );
    renderWelcome();
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar os dados/i)).toBeInTheDocument();
    });
  });

  it('mostra placeholder "—" enquanto loading', () => {
    // Manter promise pendente pra ver o estado de loading
    (prefeituraApi.getDashboard as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {
        /* never resolves */
      }),
    );
    renderWelcome();
    // 4 KPIs mostram — durante loading (o hero name é diferente)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(4);
  });
});
