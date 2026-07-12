/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUpas } from '../AdminUpas';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../api/clinicsApi', () => ({
  clinicsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    toggleStatus: vi.fn(),
    upsertShiftTemplates: vi.fn(),
  },
}));

vi.mock('../../../api/contractsApi', () => ({
  contractsApi: { getAll: vi.fn() },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { clinicsApi } from '../../../api/clinicsApi';
import { contractsApi } from '../../../api/contractsApi';
import { useAuth } from '../../../hooks/useAuth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockClinics = [
  {
    id: 'c1', name: 'UPA Vila Pereira', address: 'Rua das Flores, 210',
    phone: '11999990001', isActive: true, hasNursing: false,
    createdAt: '2026-07-12T00:00:00Z', latitude: -23.55, longitude: -46.63,
    allowedRadiusMeters: 150, capacity: 50, doctorsPerShift: 4,
    city: 'São Paulo', neighborhood: 'Vila Pereira', zipCode: '01310100',
    contractId: 'ct1',
    shiftTemplates: [
      { id: 'st1', name: 'Manhã', startTime: '07:00:00', endTime: '19:00:00', requiredStaff: 4, displayOrder: 1, professionalType: 'Medico' },
      { id: 'st2', name: 'Noite', startTime: '19:00:00', endTime: '07:00:00', requiredStaff: 4, displayOrder: 2, professionalType: 'Medico' },
    ],
  },
  {
    id: 'c2', name: 'UPA Centro', address: 'Av. Paulista, 1500',
    phone: '11999990002', isActive: false, hasNursing: true,
    createdAt: '2026-07-12T00:00:00Z', latitude: null, longitude: null,
    allowedRadiusMeters: null, capacity: 60, doctorsPerShift: 4,
    city: 'São Paulo', neighborhood: 'Bela Vista', zipCode: '01310200',
    contractId: null, shiftTemplates: [],
  },
];

const mockContracts = [
  {
    id: 'ct1', contractNumber: 'CT-2024-0087',
    publicOrganId: 'po1', publicOrganName: 'Pref. Santo André',
    publicOrganAcronym: 'PMSA', monthlyValue: 220000,
    startDate: '2024-01-01', endDate: '2026-12-31',
    minSlaPercent: 90, status: 'Active', statusLabel: 'Ativo',
    notes: null, createdAt: '2024-01-01',
    clinics: [{ id: 'c1', name: 'UPA Vila Pereira', address: 'Rua das Flores, 210', isActive: true }],
  },
];

const mockAdminGlobal = { userId: 'u-admin', email: 'admin@24p7.com', name: 'Admin Global', roles: ['AdminGlobal'], clinicId: null, clinicIds: [] };
const mockAdminClinica = { userId: 'u-ac', email: 'ac@24p7.com', name: 'Admin Clinica', roles: ['AdminClinica'], clinicId: 'c1', clinicIds: ['c1', 'c2'] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderUpas(role: 'AdminGlobal' | 'AdminClinica' = 'AdminGlobal') {
  const user = role === 'AdminGlobal' ? mockAdminGlobal : mockAdminClinica;
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user, token: 'fake', isAuthenticated: true, loading: false,
    login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
  });
  return render(
    <div id="adm-root">
      <AdminUpas onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('<AdminUpas />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics);
    (clinicsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockClinics[0], id: 'c-new' });
    (clinicsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics[0]);
    (clinicsApi.toggleStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockClinics[0], isActive: false });
    (clinicsApi.upsertShiftTemplates as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics[0]);
    (contractsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockContracts);
  });

  // ── Renderização básica ────────────────────────────────────────────────────

  it('exibe o título e subtítulo da página', async () => {
    renderUpas();
    expect(screen.getByText('Unidades de Pronto Atendimento (UPAs)')).toBeInTheDocument();
    expect(screen.getByText('Gestão de UPAs')).toBeInTheDocument();
  });

  it('exibe KPIs após carregar', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // total
    });
  });

  it('exibe os cards das duas UPAs', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('UPA Vila Pereira')).toBeInTheDocument();
      expect(screen.getByText('UPA Centro')).toBeInTheDocument();
    });
  });

  it('exibe badge Ativa e Inativa corretamente', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('Ativa')).toBeInTheDocument();
      expect(screen.getByText('Inativa')).toBeInTheDocument();
    });
  });

  it('exibe geolocalização configurada e pendente', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('Geolocalização configurada')).toBeInTheDocument();
      expect(screen.getByText('Geolocalização pendente')).toBeInTheDocument();
    });
  });

  it('exibe capacidade e meta de médicos', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText('50 leitos')).toBeInTheDocument();
      expect(screen.getAllByText('4 méd.').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('exibe chips de turnos', async () => {
    renderUpas();
    await waitFor(() => {
      expect(screen.getAllByText(/Manhã/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('lida com erro da API graciosamente', async () => {
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderUpas();
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma UPA cadastrada/)).toBeInTheDocument();
    });
  });

  // ── Role-gating: AdminGlobal ───────────────────────────────────────────────

  it('AdminGlobal vê botão "Nova UPA"', async () => {
    renderUpas('AdminGlobal');
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    expect(screen.getByRole('button', { name: /Nova UPA/ })).toBeInTheDocument();
  });

  it('AdminGlobal vê botão de toggle status nos cards', async () => {
    renderUpas('AdminGlobal');
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    // Each card: edit + toggle = 2 buttons per card, 2 cards = 4 total
    const actBtns = document.querySelectorAll('.upa-act-btn');
    expect(actBtns.length).toBeGreaterThanOrEqual(3); // at least edit + toggle on first card
  });

  it('AdminGlobal vê campo Contrato no drawer de criação', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    expect(screen.getByText('Contrato vinculado')).toBeInTheDocument();
    expect(screen.getByText('Sem contrato (vincular depois)')).toBeInTheDocument();
  });

  it('AdminGlobal vê campo Status no drawer de edição', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const editBtns = document.querySelectorAll('.upa-act-btn');
    await user.click(editBtns[0] as HTMLElement);
    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  // ── Role-gating: AdminClinica ──────────────────────────────────────────────

  it('AdminClinica NÃO vê botão "Nova UPA"', async () => {
    renderUpas('AdminClinica');
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    expect(screen.queryByRole('button', { name: /Nova UPA/ })).not.toBeInTheDocument();
  });

  it('AdminClinica vê apenas botão de editar nos cards (sem toggle status)', async () => {
    renderUpas('AdminClinica');
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    // Only edit button per card — no toggle status
    const actBtns = document.querySelectorAll('.upa-act-btn');
    expect(actBtns.length).toBe(2); // 2 cards × 1 botão (só editar)
  });

  it('AdminClinica NÃO vê campo Contrato no drawer', async () => {
    renderUpas('AdminClinica');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    // AdminClinica has no "Nova UPA" button — open via edit
    const editBtns = document.querySelectorAll('.upa-act-btn');
    await user.click(editBtns[0] as HTMLElement);
    await waitFor(() => screen.getByText('Editar UPA'));
    expect(screen.queryByText('Contrato vinculado')).not.toBeInTheDocument();
  });

  // ── Filtros ────────────────────────────────────────────────────────────────

  it('busca por nome filtra os cards', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.type(screen.getByPlaceholderText('Buscar por nome ou endereço...'), 'Centro');
    expect(screen.queryByText('UPA Vila Pereira')).not.toBeInTheDocument();
    expect(screen.getByText('UPA Centro')).toBeInTheDocument();
  });

  it('busca por endereço filtra os cards', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.type(screen.getByPlaceholderText('Buscar por nome ou endereço...'), 'Paulista');
    expect(screen.queryByText('UPA Vila Pereira')).not.toBeInTheDocument();
    expect(screen.getByText('UPA Centro')).toBeInTheDocument();
  });

  it('filtro status "Ativa" oculta UPAs inativas', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByText('Todos os status'));
    const ativaOpt = document.querySelector('.upa-cselect-option:nth-child(2)') as HTMLElement;
    await user.click(ativaOpt);
    expect(screen.getByText('UPA Vila Pereira')).toBeInTheDocument();
    expect(screen.queryByText('UPA Centro')).not.toBeInTheDocument();
  });

  it('mensagem vazia quando filtro não retorna resultados', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.type(screen.getByPlaceholderText('Buscar por nome ou endereço...'), 'xyzinexistente');
    expect(screen.getByText('Nenhuma UPA encontrada.')).toBeInTheDocument();
  });

  // ── Drawer ─────────────────────────────────────────────────────────────────

  it('abre drawer "Nova UPA" (AdminGlobal)', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    expect(document.querySelector('.upa-drawer-title')?.textContent).toBe('Nova UPA');
  });

  it('abre drawer "Editar UPA" ao clicar em editar', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(document.querySelectorAll('.upa-act-btn')[0] as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('.upa-drawer-title')?.textContent).toBe('Editar UPA');
    });
  });

  it('fecha drawer ao clicar em Cancelar', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.click(screen.getByText('Cancelar'));
    await waitFor(() => {
      expect(document.querySelector('.upa-drawer')).not.toHaveClass('open');
    });
  });

  it('botão salvar desabilitado com nome vazio', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    expect(screen.getByText('Salvar UPA')).toBeDisabled();
  });

  it('botão salvar habilitado quando nome preenchido', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'Nova UPA');
    expect(screen.getByText('Salvar UPA')).not.toBeDisabled();
  });

  it('drawer pré-preenche nome ao editar', async () => {
    renderUpas();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(document.querySelectorAll('.upa-act-btn')[0] as HTMLElement);
    await waitFor(() => {
      expect((screen.getByPlaceholderText('Ex: UPA – Vila Pereira') as HTMLInputElement).value).toBe('UPA Vila Pereira');
    });
  });

  it('drawer exibe CEP e geolocalização', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    expect(screen.getByPlaceholderText('00000-000')).toBeInTheDocument();
    expect(screen.getByText('Obter coordenadas pelo endereço')).toBeInTheDocument();
  });

  it('drawer exibe seção Turnos ativos', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    expect(screen.getByText('Turnos ativos')).toBeInTheDocument();
  });

  // ── Salvar / Editar ─────────────────────────────────────────────────────────

  it('chama clinicsApi.create ao salvar nova UPA', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'UPA Nova');
    await user.click(screen.getByText('Salvar UPA'));
    await waitFor(() => {
      expect(clinicsApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'UPA Nova' }));
    });
  });

  it('chama upsertShiftTemplates após criar', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'UPA Nova');
    await user.click(screen.getByText('Salvar UPA'));
    await waitFor(() => expect(clinicsApi.upsertShiftTemplates).toHaveBeenCalled());
  });

  it('exibe toast de sucesso após criar', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'UPA X');
    await user.click(screen.getByText('Salvar UPA'));
    await waitFor(() => expect(screen.getByText('UPA cadastrada com sucesso!')).toBeInTheDocument());
  });

  it('exibe toast de erro quando API falha', async () => {
    (clinicsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { detail: 'Já existe uma UPA com este nome.' } },
    });
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(screen.getByRole('button', { name: /Nova UPA/ }));
    await user.type(screen.getByPlaceholderText('Ex: UPA – Vila Pereira'), 'UPA Duplicada');
    await user.click(screen.getByText('Salvar UPA'));
    await waitFor(() => expect(screen.getByText('Já existe uma UPA com este nome.')).toBeInTheDocument());
  });

  it('chama update ao salvar edição', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(document.querySelectorAll('.upa-act-btn')[0] as HTMLElement);
    await waitFor(() => screen.getByText('Atualizar UPA'));
    await user.click(screen.getByText('Atualizar UPA'));
    await waitFor(() => {
      expect(clinicsApi.update).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'UPA Vila Pereira' }));
    });
  });

  // ── Toggle status ───────────────────────────────────────────────────────────

  it('AdminGlobal chama toggleStatus ao clicar no botão', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    const actBtns = document.querySelectorAll('.upa-act-btn');
    await user.click(actBtns[1] as HTMLElement); // segundo botão = toggle
    await waitFor(() => expect(clinicsApi.toggleStatus).toHaveBeenCalledWith('c1'));
  });

  it('toast confirma desativação', async () => {
    renderUpas('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('UPA Vila Pereira'));
    await user.click(document.querySelectorAll('.upa-act-btn')[1] as HTMLElement);
    await waitFor(() => expect(screen.getByText(/desativada/)).toBeInTheDocument());
  });

  // ── Theme ───────────────────────────────────────────────────────────────────

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockAdminGlobal, token: 'fake', isAuthenticated: true, loading: false,
      login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
    });
    render(<div id="adm-root"><AdminUpas onBack={vi.fn()} dark={false} onToggleTheme={onToggle} /></div>);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Gestão de UPAs'));
    await user.click(document.querySelector('.theme-toggle') as HTMLElement);
    expect(onToggle).toHaveBeenCalled();
  });
});
