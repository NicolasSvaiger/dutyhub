/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminJustificativas } from '../AdminJustificativas';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../api/justificationsApi', () => ({
  justificationsApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    startAnalysis: vi.fn(),
    respond: vi.fn(),
  },
}));

vi.mock('../../../api/clinicsApi', () => ({
  clinicsApi: { getAll: vi.fn() },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { justificationsApi } from '../../../api/justificationsApi';
import { clinicsApi } from '../../../api/clinicsApi';
import { useAuth } from '../../../hooks/useAuth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockClinics = [
  { id: 'c1', name: 'UPA Vila Pereira', isActive: true, address: '', phone: '', hasNursing: false, createdAt: '2024-01-01', shiftTemplates: [] },
  { id: 'c2', name: 'UPA Centro', isActive: true, address: '', phone: '', hasNursing: false, createdAt: '2024-01-01', shiftTemplates: [] },
];

const mockJustifications = [
  {
    id: 'j-0001', protocolNumber: 'JUS-2026-041', clinicId: 'c2', clinicName: 'UPA Centro',
    absentUserId: 'u1', absentUserName: 'Dra. Renata Silva', absentUserRegistrationNumber: 'CRM 4478-SP',
    shiftDate: '2020-05-10T00:00:00Z', shiftTurn: 'Manhã',
    requestType: 'FormalJustification', requestTypeLabel: 'Solicitar justificativa formal',
    requestText: 'A médica não compareceu ao plantão da manhã sem comunicação prévia.',
    deadlineDate: '2020-05-12T00:00:00Z',
    status: 'Pending', statusLabel: 'Aguardando',
    responseText: null, respondedAt: null, respondedByUserId: null, respondedByUserName: null,
    isDeadlineOverdue: true, daysToDeadline: -100,
    createdAt: '2020-05-10T00:00:00Z',
  },
  {
    id: 'j-0002', protocolNumber: 'JUS-2026-040', clinicId: 'c1', clinicName: 'UPA Vila Pereira',
    absentUserId: 'u2', absentUserName: 'Dr. Marcelo Dias', absentUserRegistrationNumber: 'CRM 3345-SP',
    shiftDate: '2099-05-09T00:00:00Z', shiftTurn: 'Manhã',
    requestType: 'ShiftReplacement', requestTypeLabel: 'Exigir reposição do plantão',
    requestText: 'Atraso de 50 minutos comprometendo o atendimento.',
    deadlineDate: '2099-05-11T00:00:00Z',
    status: 'UnderAnalysis', statusLabel: 'Em análise',
    responseText: null, respondedAt: null, respondedByUserId: null, respondedByUserName: null,
    isDeadlineOverdue: false, daysToDeadline: 5,
    createdAt: '2099-05-01T00:00:00Z',
  },
  {
    id: 'j-0003', protocolNumber: 'JUS-2026-038', clinicId: 'c2', clinicName: 'UPA Centro',
    absentUserId: 'u3', absentUserName: 'Dra. Mariana Costa', absentUserRegistrationNumber: 'CRM 6614-SP',
    shiftDate: '2099-05-08T00:00:00Z', shiftTurn: 'Noite',
    requestType: 'FormalJustification', requestTypeLabel: 'Solicitar justificativa formal',
    requestText: '4ª ausência registrada no mês.',
    deadlineDate: '2099-05-14T00:00:00Z',
    status: 'Approved', statusLabel: 'Aprovada',
    responseText: 'Atestado apresentado — aceito.',
    respondedAt: '2099-05-09T00:00:00Z', respondedByUserId: 'u-admin', respondedByUserName: 'Admin Global',
    isDeadlineOverdue: false, daysToDeadline: null,
    createdAt: '2099-05-01T00:00:00Z',
  },
  {
    id: 'j-0004', protocolNumber: 'JUS-2026-030', clinicId: 'c1', clinicName: 'UPA Vila Pereira',
    absentUserId: 'u4', absentUserName: 'Dra. Priscila Teles', absentUserRegistrationNumber: 'CRM 9910-SP',
    shiftDate: '2099-05-01T00:00:00Z', shiftTurn: 'Manhã',
    requestType: 'ContractPenalty', requestTypeLabel: 'Penalidade contratual',
    requestText: 'Ausência sem justificativa plausível.',
    deadlineDate: '2099-05-07T00:00:00Z',
    status: 'Rejected', statusLabel: 'Reprovada',
    responseText: 'Documentação não apresentada dentro do prazo.',
    respondedAt: '2099-05-06T00:00:00Z', respondedByUserId: 'u-admin', respondedByUserName: 'Admin Global',
    isDeadlineOverdue: false, daysToDeadline: null,
    createdAt: '2099-05-01T00:00:00Z',
  },
];

const mockAdminGlobal = {
  userId: 'u-admin', email: 'admin@24p7.com', name: 'Admin Global',
  roles: ['AdminGlobal'], clinicId: null, clinicIds: [],
};
const mockAdminClinica = {
  userId: 'u-ac', email: 'ac@24p7.com', name: 'Admin Clinica',
  roles: ['AdminClinica'], clinicId: 'c1', clinicIds: ['c1'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderJus(role: 'AdminGlobal' | 'AdminClinica' = 'AdminGlobal') {
  const user = role === 'AdminGlobal' ? mockAdminGlobal : mockAdminClinica;
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user, token: 'fake', isAuthenticated: true, loading: false,
    login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
  });
  return render(
    <div id="adm-root">
      <AdminJustificativas onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('<AdminJustificativas />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics);
    (justificationsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockJustifications);
    (justificationsApi.respond as ReturnType<typeof vi.fn>).mockResolvedValue(mockJustifications[0]);
  });

  it('exibe título e subtítulo', async () => {
    renderJus();
    expect(screen.getByText('Gestão de Justificativas')).toBeInTheDocument();
    expect(screen.getByText('Justificativas de Ausência')).toBeInTheDocument();
  });

  it('carrega dados do backend ao montar', async () => {
    renderJus();
    await waitFor(() => {
      expect(clinicsApi.getAll).toHaveBeenCalled();
      expect(justificationsApi.getAll).toHaveBeenCalled();
    });
  });

  it('exibe os KPIs calculados a partir da lista', async () => {
    renderJus();
    await waitFor(() => expect(screen.getByText('Aguardando análise')).toBeInTheDocument());
    // 1 pending, 1 underAnalysis, 1 approved, 1 rejected
    const values = document.querySelectorAll('.jus-kpi-val');
    const texts = Array.from(values).map(v => v.textContent);
    expect(texts).toEqual(['1', '1', '1', '1']);
  });

  it('exibe as justificativas carregadas na tabela', async () => {
    renderJus();
    await waitFor(() => {
      expect(screen.getByText('JUS-2026-041')).toBeInTheDocument();
      expect(screen.getByText('JUS-2026-040')).toBeInTheDocument();
      expect(screen.getByText('JUS-2026-038')).toBeInTheDocument();
      expect(screen.getByText('JUS-2026-030')).toBeInTheDocument();
    });
  });

  it('mostra estado vazio quando lista está vazia', async () => {
    (justificationsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderJus();
    await waitFor(() => {
      expect(screen.getByText('Nenhuma justificativa encontrada.')).toBeInTheDocument();
    });
  });

  it('lida com erro da API graciosamente', async () => {
    (justificationsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderJus();
    await waitFor(() => {
      expect(screen.getByText('Justificativas de Ausência')).toBeInTheDocument();
    });
  });

  // ── Ordenação: urgentes/vencidas primeiro ──────────────────────────────

  it('ordena vencidas primeiro na tabela', async () => {
    renderJus();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    const rows = document.querySelectorAll('.jus-table tbody tr');
    // primeira linha deve conter o JUS vencido
    expect(rows[0].textContent).toContain('JUS-2026-041');
  });

  // ── Filtros ─────────────────────────────────────────────────────────────

  it('campo de busca funcional (filtra por médico)', async () => {
    renderJus();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    await user.type(screen.getByPlaceholderText('Buscar por médico, UPA ou protocolo...'), 'Marcelo');
    await waitFor(() => {
      const tbody = document.querySelector('.jus-table tbody') as HTMLElement;
      expect(tbody.textContent).not.toContain('JUS-2026-041');
      expect(tbody.textContent).toContain('JUS-2026-040');
    });
  });

  it('filtra por protocolo', async () => {
    renderJus();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    await user.type(screen.getByPlaceholderText('Buscar por médico, UPA ou protocolo...'), 'JUS-2026-038');
    await waitFor(() => {
      const tbody = document.querySelector('.jus-table tbody') as HTMLElement;
      expect(tbody.textContent).toContain('JUS-2026-038');
      expect(tbody.textContent).not.toContain('JUS-2026-041');
    });
  });

  // ── Role-gating ────────────────────────────────────────────────────────

  it('AdminGlobal NÃO vê badge "Somente leitura"', async () => {
    renderJus('AdminGlobal');
    await waitFor(() => screen.getByText('JUS-2026-041'));
    expect(screen.queryByText('Somente leitura')).not.toBeInTheDocument();
  });

  it('AdminGlobal vê botões de aprovar/reprovar em justificativas pendentes', async () => {
    renderJus('AdminGlobal');
    await waitFor(() => screen.getByText('JUS-2026-041'));
    // 2 pendentes/em análise × 2 botões (aprovar + reprovar) = 4 botões inline
    expect(document.querySelectorAll('.jus-act-btn.aprovar').length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll('.jus-act-btn.reprovar').length).toBeGreaterThanOrEqual(2);
  });

  // ── Modal ──────────────────────────────────────────────────────────────

  it('abre modal ao clicar em "Ver"', async () => {
    renderJus('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    const verBtns = screen.getAllByText('Ver');
    await user.click(verBtns[0]);
    await waitFor(() => {
      expect(document.querySelector('.jus-modal-box')).not.toBeNull();
      expect(screen.getByText(/Justificativa —/)).toBeInTheDocument();
    });
  });

  it('modal mostra a resposta da OS para justificativa aprovada', async () => {
    renderJus('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-038'));
    // Encontra a linha da aprovada e clica em "Ver"
    const rows = Array.from(document.querySelectorAll('.jus-table tbody tr'));
    const approvedRow = rows.find(r => r.textContent?.includes('JUS-2026-038')) as HTMLElement;
    const verBtn = approvedRow.querySelector('.jus-act-btn.ver') as HTMLElement;
    await user.click(verBtn);
    await waitFor(() => {
      expect(screen.getByText('Resposta da OS')).toBeInTheDocument();
      expect(screen.getByText('Atestado apresentado — aceito.')).toBeInTheDocument();
    });
  });

  it('fecha modal ao clicar em Fechar', async () => {
    renderJus('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    await user.click(screen.getAllByText('Ver')[0]);
    await waitFor(() => screen.getByText('Fechar'));
    await user.click(screen.getByText('Fechar'));
    await waitFor(() => {
      expect(document.querySelector('.jus-modal-box')).toBeNull();
    });
  });

  // ── Responder ──────────────────────────────────────────────────────────

  it('bloqueia aprovar sem preencher resposta', async () => {
    renderJus('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    await user.click(screen.getAllByText('Ver')[0]);
    await waitFor(() => screen.getByText('Aprovar'));
    await user.click(screen.getByText('Aprovar'));
    await waitFor(() => {
      expect(screen.getByText(/Preencha a resposta formal/)).toBeInTheDocument();
    });
    expect(justificationsApi.respond).not.toHaveBeenCalled();
  });

  it('aprova justificativa com resposta preenchida', async () => {
    renderJus('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    await user.click(screen.getAllByText('Ver')[0]);
    await waitFor(() => screen.getByText('Aprovar'));
    const textarea = document.querySelector('.jus-resposta-field textarea') as HTMLTextAreaElement;
    await user.type(textarea, 'Justificativa aceita — atestado válido.');
    await user.click(screen.getByText('Aprovar'));
    await waitFor(() => {
      expect(justificationsApi.respond).toHaveBeenCalledWith('j-0001', {
        approve: true,
        responseText: 'Justificativa aceita — atestado válido.',
      });
    });
  });

  it('reprova justificativa com resposta preenchida', async () => {
    renderJus('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    await user.click(screen.getAllByText('Ver')[0]);
    await waitFor(() => screen.getByText('Reprovar'));
    const textarea = document.querySelector('.jus-resposta-field textarea') as HTMLTextAreaElement;
    await user.type(textarea, 'Documentação insuficiente.');
    await user.click(screen.getByText('Reprovar'));
    await waitFor(() => {
      expect(justificationsApi.respond).toHaveBeenCalledWith('j-0001', {
        approve: false,
        responseText: 'Documentação insuficiente.',
      });
    });
  });

  it('exibe toast de sucesso após responder', async () => {
    renderJus('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    await user.click(screen.getAllByText('Ver')[0]);
    await waitFor(() => screen.getByText('Aprovar'));
    const textarea = document.querySelector('.jus-resposta-field textarea') as HTMLTextAreaElement;
    await user.type(textarea, 'Aceito.');
    await user.click(screen.getByText('Aprovar'));
    await waitFor(() => {
      const toast = document.querySelector('.jus-toast') as HTMLElement;
      expect(toast.textContent).toContain('aprovada com sucesso');
    });
  });

  it('exibe toast de erro quando API falha ao responder', async () => {
    (justificationsApi.respond as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server Error'));
    renderJus('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-041'));
    await user.click(screen.getAllByText('Ver')[0]);
    await waitFor(() => screen.getByText('Aprovar'));
    const textarea = document.querySelector('.jus-resposta-field textarea') as HTMLTextAreaElement;
    await user.type(textarea, 'Teste.');
    await user.click(screen.getByText('Aprovar'));
    await waitFor(() => {
      const toast = document.querySelector('.jus-toast') as HTMLElement;
      expect(toast.textContent).toContain('Erro ao responder');
    });
  });

  // ── Justificativa já respondida ────────────────────────────────────────

  it('modal de justificativa aprovada NÃO mostra campo de resposta', async () => {
    renderJus('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('JUS-2026-038'));
    const rows = Array.from(document.querySelectorAll('.jus-table tbody tr'));
    const approvedRow = rows.find(r => r.textContent?.includes('JUS-2026-038')) as HTMLElement;
    const verBtn = approvedRow.querySelector('.jus-act-btn.ver') as HTMLElement;
    await user.click(verBtn);
    await waitFor(() => screen.getByText(/Justificativa —/));
    expect(document.querySelector('.jus-resposta-field')).toBeNull();
    expect(screen.queryByText('Aprovar')).not.toBeInTheDocument();
    expect(screen.queryByText('Reprovar')).not.toBeInTheDocument();
  });

  // ── Theme ──────────────────────────────────────────────────────────────

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockAdminGlobal, token: 'fake', isAuthenticated: true, loading: false,
      login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
    });
    render(<div id="adm-root"><AdminJustificativas onBack={vi.fn()} dark={false} onToggleTheme={onToggle} /></div>);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Gestão de Justificativas'));
    await user.click(document.querySelector('.theme-toggle') as HTMLElement);
    expect(onToggle).toHaveBeenCalled();
  });
});
