/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminOrgaos } from '../AdminOrgaos';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../api/contractsApi', () => ({
  contractsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { contractsApi } from '../../../api/contractsApi';
import { useAuth } from '../../../hooks/useAuth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockContractActive = {
  id: 'c1',
  contractNumber: 'CT-2024-0087',
  publicOrganId: 'po1',
  publicOrganName: 'Prefeitura Municipal de Santo André',
  publicOrganAcronym: 'PMSA',
  publicOrganCnpj: '12345678000199',
  publicOrganDepartment: 'Secretaria de Saúde',
  publicOrganContactName: 'João Silva',
  publicOrganContactEmail: 'joao@pmsa.sp.gov.br',
  publicOrganContactPhone: '11999990001',
  publicOrganCity: 'Santo André',
  publicOrganState: 'SP',
  monthlyValue: 220000,
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2099-12-31T00:00:00Z',
  minSlaPercent: 90,
  status: 'Active',
  statusLabel: 'Ativo',
  notes: null,
  createdAt: '2024-01-01T00:00:00Z',
  clinics: [{ id: 'cl1', name: 'Clínica Alpha', address: 'Rua Pirai', isActive: true }],
};

const mockContractRenewal = {
  id: 'c2',
  contractNumber: 'CT-2023-0142',
  publicOrganId: 'po2',
  publicOrganName: 'Prefeitura Municipal de Diadema',
  publicOrganAcronym: 'PMD',
  publicOrganCnpj: null,
  publicOrganDepartment: null,
  publicOrganContactName: null,
  publicOrganContactEmail: null,
  publicOrganContactPhone: null,
  publicOrganCity: null,
  publicOrganState: null,
  monthlyValue: 160000,
  startDate: '2023-07-01T00:00:00Z',
  endDate: '2026-07-30T00:00:00Z',
  minSlaPercent: 85,
  status: 'Renewal',
  statusLabel: 'Renovação',
  notes: 'Em processo de renovação.',
  createdAt: '2023-07-01T00:00:00Z',
  clinics: [{ id: 'cl2', name: 'Clínica Beta', address: 'Rua Beta, 200', isActive: true }],
};

const mockAdminGlobal = {
  userId: 'u-admin', email: 'admin@24p7.com', name: 'Admin Global',
  roles: ['AdminGlobal'], clinicId: null, clinicIds: [],
};
const mockAdminClinica = {
  userId: 'u-ac', email: 'ac@24p7.com', name: 'Admin Clinica',
  roles: ['AdminClinica'], clinicId: 'cl1', clinicIds: ['cl1'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderOrgaos(role: 'AdminGlobal' | 'AdminClinica' = 'AdminGlobal') {
  const user = role === 'AdminGlobal' ? mockAdminGlobal : mockAdminClinica;
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user, token: 'fake', isAuthenticated: true, loading: false,
    login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
  });
  return render(
    <div id="adm-root">
      <AdminOrgaos onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('<AdminOrgaos />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (contractsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      mockContractActive,
      mockContractRenewal,
    ]);
    (contractsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockContractActive);
    (contractsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockContractActive);
  });

  // ── Renderização básica ────────────────────────────────────────────────────

  it('exibe título e subtítulo', async () => {
    renderOrgaos();
    expect(screen.getByText('Órgãos Públicos')).toBeInTheDocument();
    expect(screen.getByText('Gestão de Contratos')).toBeInTheDocument();
  });

  it('exibe cards dos contratos após carregar', async () => {
    renderOrgaos();
    await waitFor(() => {
      expect(screen.getByText('Prefeitura Municipal de Santo André')).toBeInTheDocument();
      expect(screen.getByText('Prefeitura Municipal de Diadema')).toBeInTheDocument();
    });
  });

  it('exibe números de contrato nos cards', async () => {
    renderOrgaos();
    await waitFor(() => {
      expect(screen.getAllByText('CT-2024-0087').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('CT-2023-0142').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('lida com erro da API graciosamente', async () => {
    (contractsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderOrgaos();
    await waitFor(() => {
      expect(screen.getByText('Nenhum contrato cadastrado.')).toBeInTheDocument();
    });
  });

  // ── KPIs ──────────────────────────────────────────────────────────────────

  it('KPI contratos ativos conta apenas Active não expirados', async () => {
    renderOrgaos();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    // 1 Active (não expirado)
    const kpiAtivos = document.querySelector('.org-kpi.indigo .org-kpi-val');
    expect(kpiAtivos?.textContent).toBe('1');
  });

  it('KPI Em renovação conta Renewal independente de data', async () => {
    renderOrgaos();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    // 1 Renewal (PMD)
    const kpiRenovacao = document.querySelector('.org-kpi.yellow .org-kpi-val');
    expect(kpiRenovacao?.textContent).toBe('1');
  });

  it('KPI UPAs cobertas conta clinics de contratos não expirados', async () => {
    renderOrgaos();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    const kpiUpas = document.querySelector('.org-kpi.teal .org-kpi-val');
    expect(kpiUpas?.textContent).toBe('2'); // 1 da Alpha + 1 da Beta (ambas não expiradas)
  });

  // ── Badges de status ───────────────────────────────────────────────────────

  it('exibe badge Ativo para contrato Active não expirado', async () => {
    renderOrgaos();
    await waitFor(() => screen.getByText('Ativo'));
  });

  it('exibe badge Renovação para contrato Renewal', async () => {
    renderOrgaos();
    await waitFor(() => screen.getByText('Renovação'));
  });

  it('exibe badge Vencido para contrato com data expirada', async () => {
    (contractsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([{
      ...mockContractActive,
      endDate: '2020-01-01T00:00:00Z', // expirado
      status: 'Active',
    }]);
    renderOrgaos();
    await waitFor(() => expect(screen.getByText('Vencido')).toBeInTheDocument());
  });

  // ── Role-gating: AdminGlobal ───────────────────────────────────────────────

  it('AdminGlobal vê botão "Novo contrato"', async () => {
    renderOrgaos('AdminGlobal');
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    expect(screen.getByRole('button', { name: /Novo contrato/ })).toBeInTheDocument();
  });

  it('AdminGlobal vê botão de editar nos cards', async () => {
    renderOrgaos('AdminGlobal');
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    const editBtns = document.querySelectorAll('.org-act-btn');
    expect(editBtns.length).toBeGreaterThanOrEqual(1);
  });

  // ── Role-gating: AdminClinica ──────────────────────────────────────────────

  it('AdminClinica NÃO vê botão "Novo contrato"', async () => {
    renderOrgaos('AdminClinica');
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    expect(screen.queryByRole('button', { name: /Novo contrato/ })).not.toBeInTheDocument();
  });

  it('AdminClinica vê badge "Gerenciado pela 24p7"', async () => {
    renderOrgaos('AdminClinica');
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    expect(screen.getByText(/Gerenciado pela 24p7/)).toBeInTheDocument();
  });

  it('AdminClinica NÃO vê botões de editar nos cards', async () => {
    renderOrgaos('AdminClinica');
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    expect(document.querySelectorAll('.org-act-btn').length).toBe(0);
  });

  // ── Filtros ────────────────────────────────────────────────────────────────

  it('busca por nome filtra cards', async () => {
    renderOrgaos();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.type(
      screen.getByPlaceholderText('Buscar por nome do órgão ou nº contrato...'),
      'Diadema',
    );
    expect(screen.queryByText('Prefeitura Municipal de Santo André')).not.toBeInTheDocument();
    expect(screen.getByText('Prefeitura Municipal de Diadema')).toBeInTheDocument();
  });

  it('busca por número de contrato filtra cards', async () => {
    renderOrgaos();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.type(
      screen.getByPlaceholderText('Buscar por nome do órgão ou nº contrato...'),
      'CT-2024',
    );
    expect(screen.getByText('Prefeitura Municipal de Santo André')).toBeInTheDocument();
    expect(screen.queryByText('Prefeitura Municipal de Diadema')).not.toBeInTheDocument();
  });

  it('mensagem vazia quando busca não retorna resultados', async () => {
    renderOrgaos();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.type(
      screen.getByPlaceholderText('Buscar por nome do órgão ou nº contrato...'),
      'xyzinexistente',
    );
    expect(screen.getByText('Nenhum contrato encontrado.')).toBeInTheDocument();
  });

  // ── Drawer ─────────────────────────────────────────────────────────────────

  it('abre drawer "Novo contrato" (AdminGlobal)', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(screen.getByRole('button', { name: /Novo contrato/ }));
    expect(document.querySelector('.org-drawer-title')?.textContent).toBe('Novo contrato');
  });

  it('abre drawer "Editar contrato" ao clicar em editar', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(document.querySelectorAll('.org-act-btn')[0] as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('.org-drawer-title')?.textContent).toBe('Editar contrato');
    });
  });

  it('drawer de edição preenche todos os campos do órgão', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(document.querySelectorAll('.org-act-btn')[0] as HTMLElement);
    await waitFor(() => {
      const nomeInput = screen.getByPlaceholderText('Ex: Prefeitura Municipal de Santo André') as HTMLInputElement;
      expect(nomeInput.value).toBe('Prefeitura Municipal de Santo André');
    });
    const siglaInput = screen.getByPlaceholderText('Ex: PMSA') as HTMLInputElement;
    expect(siglaInput.value).toBe('PMSA');
    const cidadeInput = screen.getByPlaceholderText('Ex: Santo André') as HTMLInputElement;
    expect(cidadeInput.value).toBe('Santo André');
    const ufInput = screen.getByPlaceholderText('SP') as HTMLInputElement;
    expect(ufInput.value).toBe('SP');
  });

  it('drawer de edição preenche campos do contrato', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(document.querySelectorAll('.org-act-btn')[0] as HTMLElement);
    await waitFor(() => {
      const numInput = screen.getByPlaceholderText('Ex: CT-2026-0001') as HTMLInputElement;
      expect(numInput.value).toBe('CT-2024-0087');
    });
  });

  it('fecha drawer ao clicar em Cancelar', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(screen.getByRole('button', { name: /Novo contrato/ }));
    await user.click(screen.getByText('Cancelar'));
    await waitFor(() => {
      expect(document.querySelector('.org-drawer')).not.toHaveClass('open');
    });
  });

  it('botão salvar desabilitado sem nome do órgão', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(screen.getByRole('button', { name: /Novo contrato/ }));
    expect(screen.getByText('Salvar contrato')).toBeDisabled();
  });

  it('botão salvar habilitado com nome e nº contrato preenchidos', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(screen.getByRole('button', { name: /Novo contrato/ }));
    await user.type(screen.getByPlaceholderText('Ex: Prefeitura Municipal de Santo André'), 'Pref Teste');
    await user.type(screen.getByPlaceholderText('Ex: CT-2026-0001'), 'CT-2026-0099');
    expect(screen.getByText('Salvar contrato')).not.toBeDisabled();
  });

  // ── Salvar / Criar ─────────────────────────────────────────────────────────

  it('chama contractsApi.create ao salvar novo contrato', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(screen.getByRole('button', { name: /Novo contrato/ }));
    await user.type(screen.getByPlaceholderText('Ex: Prefeitura Municipal de Santo André'), 'Nova Pref');
    await user.type(screen.getByPlaceholderText('Ex: CT-2026-0001'), 'CT-NEW-001');
    await user.click(screen.getByText('Salvar contrato'));
    await waitFor(() => {
      expect(contractsApi.create).toHaveBeenCalledWith(expect.objectContaining({
        organName: 'Nova Pref',
        contractNumber: 'CT-NEW-001',
      }));
    });
  });

  it('chama contractsApi.update ao editar contrato', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(document.querySelectorAll('.org-act-btn')[0] as HTMLElement);
    await waitFor(() => screen.getByText('Atualizar contrato'));
    await user.click(screen.getByText('Atualizar contrato'));
    await waitFor(() => {
      expect(contractsApi.update).toHaveBeenCalledWith('c1', expect.objectContaining({
        organName: 'Prefeitura Municipal de Santo André',
        contractNumber: 'CT-2024-0087',
        organCity: 'Santo André',
        organState: 'SP',
      }));
    });
  });

  it('atualiza lista localmente após editar sem reload', async () => {
    const updatedContract = { ...mockContractActive, contractNumber: 'CT-2024-UPDATED' };
    (contractsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedContract);

    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(document.querySelectorAll('.org-act-btn')[0] as HTMLElement);
    await waitFor(() => screen.getByText('Atualizar contrato'));
    await user.click(screen.getByText('Atualizar contrato'));
    await waitFor(() => {
      expect(screen.getAllByText('CT-2024-UPDATED').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('exibe toast de sucesso após criar', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(screen.getByRole('button', { name: /Novo contrato/ }));
    await user.type(screen.getByPlaceholderText('Ex: Prefeitura Municipal de Santo André'), 'Pref X');
    await user.type(screen.getByPlaceholderText('Ex: CT-2026-0001'), 'CT-X');
    await user.click(screen.getByText('Salvar contrato'));
    await waitFor(() => expect(screen.getByText('Contrato cadastrado com sucesso!')).toBeInTheDocument());
  });

  it('exibe toast de sucesso após atualizar', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(document.querySelectorAll('.org-act-btn')[0] as HTMLElement);
    await waitFor(() => screen.getByText('Atualizar contrato'));
    await user.click(screen.getByText('Atualizar contrato'));
    await waitFor(() => expect(screen.getByText('Contrato atualizado com sucesso!')).toBeInTheDocument());
  });

  it('exibe toast de erro quando campos obrigatórios ausentes', async () => {
    renderOrgaos('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Prefeitura Municipal de Santo André'));
    await user.click(screen.getByRole('button', { name: /Novo contrato/ }));
    // Tenta clicar salvar com campos vazios (botão desabilitado — não dispara)
    expect(screen.getByText('Salvar contrato')).toBeDisabled();
  });

  // ── Chips de UPAs no card ──────────────────────────────────────────────────

  it('exibe chips de UPAs no card do contrato', async () => {
    renderOrgaos();
    await waitFor(() => {
      expect(screen.getByText('Clínica Alpha')).toBeInTheDocument();
      expect(screen.getByText('Clínica Beta')).toBeInTheDocument();
    });
  });

  // ── Theme ──────────────────────────────────────────────────────────────────

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockAdminGlobal, token: 'fake', isAuthenticated: true, loading: false,
      login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
    });
    render(<div id="adm-root"><AdminOrgaos onBack={vi.fn()} dark={false} onToggleTheme={onToggle} /></div>);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Gestão de Contratos'));
    await user.click(document.querySelector('.theme-toggle') as HTMLElement);
    expect(onToggle).toHaveBeenCalled();
  });
});
