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

vi.mock('../../../api/gestoresApi', () => ({
  gestoresApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    toggleStatus: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { contractsApi } from '../../../api/contractsApi';
import { gestoresApi } from '../../../api/gestoresApi';
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

const mockGestores = [
  {
    id: 'g1', name: 'Valmir Sousa', email: 'valmir@santoandre.gov.br',
    phone: '11999998888', cargo: 'Secretário de Saúde',
    publicOrganId: 'po1', publicOrganName: 'Pref. Santo André',
    publicOrganAcronym: 'PMSA', isActive: true,
    createdAt: '2026-01-15T10:00:00Z', assignedAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'g2', name: 'Sileide Rocha', email: 'sileide@santoandre.gov.br',
    phone: null, cargo: null,
    publicOrganId: 'po1', publicOrganName: 'Pref. Santo André',
    publicOrganAcronym: 'PMSA', isActive: false,
    createdAt: '2026-02-01T12:00:00Z', assignedAt: '2026-02-01T12:00:00Z',
  },
  {
    id: 'g3', name: 'Carlos Lima', email: 'carlos@diadema.gov.br',
    phone: null, cargo: null,
    publicOrganId: 'po2', publicOrganName: 'Pref. Diadema',
    publicOrganAcronym: 'PMD', isActive: true,
    createdAt: '2026-03-10T09:00:00Z', assignedAt: '2026-03-10T09:00:00Z',
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
    (gestoresApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockGestores);
    (gestoresApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockGestores[0], id: 'g-new' });
    (gestoresApi.toggleStatus as ReturnType<typeof vi.fn>).mockResolvedValue(mockGestores[0]);
    (gestoresApi.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  // ── Render + loading ───────────────────────────────────────────────────────

  it('chama gestoresApi.getAll + contractsApi.getAll no mount', async () => {
    renderGestores();
    await waitFor(() => {
      expect(gestoresApi.getAll).toHaveBeenCalledTimes(1);
      expect(contractsApi.getAll).toHaveBeenCalledTimes(1);
    });
  });

  it('exibe título e subtítulo da página', async () => {
    renderGestores();
    expect(screen.getByText('Gestores do Órgão Público')).toBeInTheDocument();
    expect(screen.getByText('Gestores Cadastrados')).toBeInTheDocument();
  });

  it('renderiza gestores retornados pela API na tabela', async () => {
    renderGestores();
    await waitFor(() => {
      expect(screen.getByText('Valmir Sousa')).toBeInTheDocument();
    });
    expect(screen.getByText('Sileide Rocha')).toBeInTheDocument();
    expect(screen.getByText('Carlos Lima')).toBeInTheDocument();
    // Emails também
    expect(screen.getByText('valmir@santoandre.gov.br')).toBeInTheDocument();
  });

  it('KPIs refletem a lista da API (2 ativos, 1 inativo, 3 total, 2 órgãos)', async () => {
    renderGestores();
    await waitFor(() => expect(screen.getByText('Valmir Sousa')).toBeInTheDocument());
    // 3 total, 2 ativos, 1 inativo, 2 órgãos. Cada valor renderiza como
    // conteúdo do .gest-kpi-val. Verificamos alguns por texto direto.
    const total = document.querySelector('.gest-kpi.indigo .gest-kpi-val')?.textContent;
    const ativos = document.querySelector('.gest-kpi.green .gest-kpi-val')?.textContent;
    expect(total).toBe('3');
    expect(ativos).toBe('2');
  });

  it('empty state contextual: AdminGlobal orientado a criar', async () => {
    (gestoresApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderGestores('AdminGlobal');
    await waitFor(() => {
      expect(screen.getByText(/Nenhum gestor cadastrado/)).toBeInTheDocument();
      expect(screen.getByText(/Clique em.*Novo gestor/i)).toBeInTheDocument();
    });
  });

  it('empty state contextual: AdminClinica sem orientação de cadastro', async () => {
    (gestoresApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderGestores('AdminClinica');
    await waitFor(() => {
      expect(screen.getByText(/A OS ainda não cadastrou gestores/i)).toBeInTheDocument();
    });
  });

  it('lida com erro da API graciosamente (mostra layout, sem crash)', async () => {
    (gestoresApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
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

  it('AdminClinica NÃO vê botões de escrita nas linhas (toggle/revogar)', async () => {
    renderGestores('AdminClinica');
    await waitFor(() => expect(screen.getByText('Valmir Sousa')).toBeInTheDocument());
    // Nenhum botão "Revogar acesso" ou "Desativar gestor" aparece pra AdminClinica
    expect(screen.queryByTitle(/Revogar acesso/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Desativar gestor/)).not.toBeInTheDocument();
  });

  // ── Drawer "Novo gestor" (AdminGlobal) ─────────────────────────────────────

  it('abre drawer ao clicar em "+ Novo gestor"', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));
    expect(screen.getByText('Novo gestor do órgão público')).toBeInTheDocument();
  });

  it('drawer exibe seção Dados do gestor com inputs', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));
    expect(screen.getByPlaceholderText('Ex: Valmir Correia Sousa')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('gestor@prefeitura.gov.br')).toBeInTheDocument();
  });

  // ── Fluxo de criação end-to-end ────────────────────────────────────────────

  it('salvar chama gestoresApi.create com publicOrganId do contrato + refetch', async () => {
    // Tabela vazia neste caso — evita colisão de "UPA Vila Pereira" entre
    // chips da tabela (via contract join) e a lista do drawer.
    (gestoresApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));

    // Preencher form
    await user.type(screen.getByPlaceholderText('Ex: Valmir Correia Sousa'), 'Novo Gestor');
    await user.type(screen.getByPlaceholderText('gestor@prefeitura.gov.br'), 'novo@teste.gov.br');

    // Selecionar contrato (2ª opção do CustomSelect — a primeira é "Selecione o contrato...")
    const cselect = document.querySelector('.gest-cselect-btn') as HTMLElement;
    await user.click(cselect);
    const opt = document.querySelector('.gest-cselect-option:nth-child(2)') as HTMLElement;
    await user.click(opt);

    // Selecionar pelo menos uma UPA
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const checkbox = document.querySelector('.gest-clinic-check-item input') as HTMLInputElement;
    await user.click(checkbox);

    // Salvar
    await user.click(screen.getByRole('button', { name: /Salvar e enviar convite/i }));

    await waitFor(() => {
      expect(gestoresApi.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Novo Gestor',
        email: 'novo@teste.gov.br',
        publicOrganId: 'po1',
      }));
    });
    // Refetch dispara segundo getAll (1 mount + 1 após create)
    await waitFor(() => {
      expect(gestoresApi.getAll).toHaveBeenCalledTimes(2);
    });
  });

  it('salvar em erro 409 (conflict) mostra toast de email duplicado', async () => {
    (gestoresApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (gestoresApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Request failed with status code 409'));
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));

    await user.type(screen.getByPlaceholderText('Ex: Valmir Correia Sousa'), 'X');
    await user.type(screen.getByPlaceholderText('gestor@prefeitura.gov.br'), 'x@x.com');
    const cselect = document.querySelector('.gest-cselect-btn') as HTMLElement;
    await user.click(cselect);
    const opt = document.querySelector('.gest-cselect-option:nth-child(2)') as HTMLElement;
    await user.click(opt);
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const checkbox = document.querySelector('.gest-clinic-check-item input') as HTMLInputElement;
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: /Salvar e enviar convite/i }));

    await waitFor(() => {
      expect(screen.getByText(/Já existe um usuário com esse e-mail/)).toBeInTheDocument();
    });
  });

  it('fecha drawer ao clicar em Cancelar', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /Novo gestor/ }));
    await user.click(screen.getByRole('button', { name: /^Cancelar$/i }));
    await waitFor(() => {
      expect(document.querySelector('.gest-drawer')).not.toHaveClass('open');
    });
  });

  // ── Mutações inline ────────────────────────────────────────────────────────

  it('clicar em "Revogar acesso" pede confirm e chama gestoresApi.remove', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Valmir Sousa')).toBeInTheDocument());

    const revogar = screen.getAllByTitle('Revogar acesso')[0];
    await user.click(revogar);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(gestoresApi.remove).toHaveBeenCalledWith('g1');
    });
    // Refetch após remove
    await waitFor(() => expect(gestoresApi.getAll).toHaveBeenCalledTimes(2));
    confirmSpy.mockRestore();
  });

  it('cancelar o confirm de revogar NÃO chama gestoresApi.remove', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Valmir Sousa')).toBeInTheDocument());

    const revogar = screen.getAllByTitle('Revogar acesso')[0];
    await user.click(revogar);

    expect(confirmSpy).toHaveBeenCalled();
    expect(gestoresApi.remove).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('clicar em desativar chama gestoresApi.toggleStatus', async () => {
    renderGestores('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Valmir Sousa')).toBeInTheDocument());

    // Valmir está ativo → botão "Desativar gestor"
    const toggle = screen.getAllByTitle(/Desativar gestor/)[0];
    await user.click(toggle);

    await waitFor(() => {
      expect(gestoresApi.toggleStatus).toHaveBeenCalledWith('g1');
    });
  });

  // ── Filtros ────────────────────────────────────────────────────────────────

  it('exibe campo de busca e filtros', async () => {
    renderGestores();
    expect(screen.getByPlaceholderText('Buscar por nome ou e-mail...')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Todos os órgãos')).toBeInTheDocument();
      expect(screen.getByText('Todos os status')).toBeInTheDocument();
    });
  });

  // ── Theme ──────────────────────────────────────────────────────────────────

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
