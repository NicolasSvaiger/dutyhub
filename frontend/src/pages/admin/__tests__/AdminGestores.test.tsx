/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminGestores } from '../AdminGestores';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../api/contractsApi', () => ({
  contractsApi: { getAll: vi.fn() },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { contractsApi } from '../../../api/contractsApi';
import { useAuth } from '../../../hooks/useAuth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockContracts = [
  {
    id: 'ct1', contractNumber: 'CT-2024-0087',
    publicOrganId: 'po1', publicOrganName: 'Pref. Santo André',
    publicOrganAcronym: 'PMSA', monthlyValue: 220000,
    startDate: '2024-01-01T00:00:00Z', endDate: '2026-12-31T00:00:00Z',
    minSlaPercent: 90, status: 'Active', statusLabel: 'Ativo',
    notes: null, createdAt: '2024-01-01T00:00:00Z',
    clinics: [
      { id: 'c1', name: 'UPA Vila Pereira', address: 'Rua das Flores, 210', isActive: true },
      { id: 'c2', name: 'UPA Centro', address: 'Av. Paulista, 1500', isActive: true },
    ],
  },
  {
    id: 'ct2', contractNumber: 'CT-2023-0142',
    publicOrganId: 'po2', publicOrganName: 'Pref. Diadema',
    publicOrganAcronym: 'PMD', monthlyValue: 160000,
    startDate: '2023-01-01T00:00:00Z', endDate: '2025-12-31T00:00:00Z',
    minSlaPercent: 85, status: 'Renewal', statusLabel: 'Renovação',
    notes: null, createdAt: '2023-01-01T00:00:00Z',
    clinics: [{ id: 'c3', name: 'UPA Zona Sul', address: 'Rua B, 200', isActive: true }],
  },
];

const mockAdminGlobal = {
  userId: 'u-admin', email: 'admin@24p7.com', name: 'Admin Global',
  roles: ['AdminGlobal'], clinicId: null, clinicIds: [],
};
const mockAdminClinica = {
  userId: 'u-ac', email: 'ac@24p7.com', name: 'Admin Clinica',
  roles: ['AdminClinica'], clinicId: 'c1', clinicIds: ['c1', 'c2'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderGestores(role: 'AdminGlobal' | 'AdminClinica' = 'AdminGlobal') {
  const authUser = role === 'AdminGlobal' ? mockAdminGlobal : mockAdminClinica;
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: authUser, token: 'fake', isAuthenticated: true, loading: false,
    login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
  });
  return render(
    <div id="adm-root">
      <AdminGestores onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('<AdminGestores />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (contractsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockContracts);
  });

  // ── Renderização básica ────────────────────────────────────────────────────

  it('exibe o título e subtítulo da página', async () => {
    renderGestores();
    expect(screen.getByText('Gestores do Órgão Público')).toBeInTheDocument();
    expect(screen.getByText('Gestores Cadastrados')).toBeInTheDocument();
  });

  it('exibe KPIs com zeros (lista vazia — Sprint 7)', async () => {
    renderGestores();
    await waitFor(() => {
      // All KPI values should be 0
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('exibe mensagem de estado vazio explicativa', async () => {
    renderGestores();
    await waitFor(() => {
      expect(screen.getByText(/Nenhum gestor cadastrado/)).toBeInTheDocument();
    });
  });

  it('exibe cabeçalhos da tabela', async () => {
    renderGestores();
    await waitFor(() => {
      expect(screen.getByText('Gestor')).toBeInTheDocument();
      expect(screen.getByText('Órgão público')).toBeInTheDocument();
      expect(screen.getByText('Nível de acesso')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Ações')).toBeInTheDocument();
    });
  });

  it('lida com erro da API graciosamente', async () => {
    (contractsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderGestores();
    await waitFor(() => {
      expect(screen.getByText('Gestores Cadastrados')).toBeInTheDocument();
    });
  });

  // ── Role-gating: AdminGlobal ───────────────────────────────────────────────

  it('AdminGlobal vê botão "+ Novo gestor"', async () => {
    renderGestores('AdminGlobal');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Novo gestor/ })).toBeInTheDocument();
    });
  });

  it('AdminGlobal NÃO vê badge "Cadastro exclusivo 24p7"', async () => {
    renderGestores('AdminGlobal');
    await waitFor(() => {
      expect(screen.queryByText(/Cadastro exclusivo/)).not.toBeInTheDocument();
    });
  });

  // ── Role-gating: AdminClinica ──────────────────────────────────────────────

  it('AdminClinica NÃO vê botão "+ Novo gestor"', async () => {
    renderGestores('AdminClinica');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Novo gestor/ })).not.toBeInTheDocument();
    });
  });

  it('AdminClinica vê badge "Cadastro exclusivo 24p7"', async () => {
    renderGestores('AdminClinica');
    await waitFor(() => {
      expect(screen.getByText(/Cadastro exclusivo/)).toBeInTheDocument();
    });
  });

  // ── Filtros ────────────────────────────────────────────────────────────────

  it('exibe selects de filtro de órgãos e status', async () => {
    renderGestores();
    await waitFor(() => {
      expect(screen.getByText('Todos os órgãos')).toBeInTheDocument();
      expect(screen.getByText('Todos os status')).toBeInTheDocument();
    });
  });

  it('campo de busca está presente', async () => {
    renderGestores();
    expect(screen.getByPlaceholderText('Buscar por nome ou e-mail...')).toBeInTheDocument();
  });

  // ── Drawer "Novo gestor" (AdminGlobal) ─────────────────────────────────────

  it('abre drawer ao clicar em "+ Novo gestor"', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));
    expect(screen.getByText('Novo gestor do órgão público')).toBeInTheDocument();
  });

  it('drawer exibe seção Dados do gestor', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));
    expect(screen.getByText('Dados do gestor')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: Valmir Correia Sousa')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('gestor@prefeitura.gov.br')).toBeInTheDocument();
  });

  it('drawer exibe seção Contrato vinculado com contratos carregados', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));
    // Verifica a seção existe
    expect(screen.getByText('Contrato vinculado')).toBeInTheDocument();
    // Verifica o label inicial do CustomSelect (primeiro contrato é pré-selecionado via openDrawer)
    // ou que o botão do cselect existe dentro do drawer
    const drawerBody = document.querySelector('.gest-drawer-body');
    expect(drawerBody).not.toBeNull();
    // O CustomSelect deve estar presente dentro do drawer
    const cselect = drawerBody?.querySelector('.gest-cselect');
    expect(cselect).not.toBeNull();
    // Os contratos foram carregados (não há mensagem de "sem contratos")
    expect((contractsApi.getAll as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('drawer exibe 4 opções de nível de acesso', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));
    expect(screen.getByText(/Acesso completo/)).toBeInTheDocument();
    expect(screen.getByText(/Somente relatórios/)).toBeInTheDocument();
    expect(screen.getByText(/Dashboard \+ TV/)).toBeInTheDocument();
    expect(screen.getByText(/Somente leitura/)).toBeInTheDocument();
  });

  it('drawer exibe UPAs ao selecionar contrato', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));

    // Selecionar o contrato CT-2024-0087
    const cselect = document.querySelector('.gest-cselect-btn') as HTMLElement;
    await user.click(cselect);
    const opt = document.querySelector('.gest-cselect-option:nth-child(2)') as HTMLElement;
    await user.click(opt);

    await waitFor(() => {
      expect(screen.getByText('UPA Vila Pereira')).toBeInTheDocument();
      expect(screen.getByText('UPA Centro')).toBeInTheDocument();
    });
  });

  it('botão "Salvar e enviar convite" desabilitado sem contrato selecionado', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));
    // Preenche nome e email mas sem contrato
    await user.type(screen.getByPlaceholderText('Ex: Valmir Correia Sousa'), 'Gestor Teste');
    await user.type(screen.getByPlaceholderText('gestor@prefeitura.gov.br'), 'gestor@teste.gov.br');
    const saveBtn = screen.getByText('Salvar e enviar convite');
    expect(saveBtn).toBeDisabled();
  });

  it('fecha drawer ao clicar em Cancelar', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByText('Cancelar'));
    await waitFor(() => {
      expect(document.querySelector('.gest-drawer')).not.toHaveClass('open');
    });
  });

  it('salvar exibe toast de confirmação (Sprint 7 placeholder)', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));

    // Preencher nome e email
    await user.type(screen.getByPlaceholderText('Ex: Valmir Correia Sousa'), 'Gestor Teste');
    await user.type(screen.getByPlaceholderText('gestor@prefeitura.gov.br'), 'gestor@teste.gov.br');

    // Selecionar contrato
    const cselect = document.querySelector('.gest-cselect-btn') as HTMLElement;
    await user.click(cselect);
    const opt = document.querySelector('.gest-cselect-option:nth-child(2)') as HTMLElement;
    await user.click(opt);

    // Selecionar pelo menos uma UPA
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const checkbox = document.querySelector('.gest-clinic-check-item input') as HTMLInputElement;
    await user.click(checkbox);

    await user.click(screen.getByText('Salvar e enviar convite'));

    await waitFor(() => {
      expect(screen.getByText(/Convite para Gestor Teste/)).toBeInTheDocument();
    });
  });

  // ── Theme ───────────────────────────────────────────────────────────────────

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockAdminGlobal, token: 'fake', isAuthenticated: true, loading: false,
      login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
    });
    render(<div id="adm-root"><AdminGestores onBack={vi.fn()} dark={false} onToggleTheme={onToggle} /></div>);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Gestores Cadastrados'));
    await user.click(document.querySelector('.theme-toggle') as HTMLElement);
    expect(onToggle).toHaveBeenCalled();
  });
});
