/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminSubstituicoes } from '../AdminSubstituicoes';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../api/substitutionsApi', () => ({
  substitutionsApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    assignSubstitute: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('../../../api/clinicsApi', () => ({
  clinicsApi: { getAll: vi.fn() },
}));

vi.mock('../../../api/usersApi', () => ({
  usersApi: { getAll: vi.fn() },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { substitutionsApi } from '../../../api/substitutionsApi';
import { clinicsApi } from '../../../api/clinicsApi';
import { usersApi } from '../../../api/usersApi';
import { useAuth } from '../../../hooks/useAuth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockClinics = [
  { id: 'c1', name: 'UPA Vila Pereira', isActive: true, address: '', phone: '', hasNursing: false, createdAt: '2024-01-01', shiftTemplates: [] },
  { id: 'c2', name: 'UPA Centro', isActive: true, address: '', phone: '', hasNursing: false, createdAt: '2024-01-01', shiftTemplates: [] },
];

const mockUsers = [
  { id: 'u1', name: 'Dra. Renata Silva', email: 'renata@x.com', professionalType: 'Medico', isActive: true, registrationNumber: 'CRM 4478-SP', createdAt: '2024-01-01', roles: [] },
  { id: 'u2', name: 'Dra. Jessica Lima', email: 'jessica@x.com', professionalType: 'Medico', isActive: true, registrationNumber: 'CRM 5485-SP', createdAt: '2024-01-01', roles: [] },
  { id: 'u3', name: 'Dr. Roberto Alves', email: 'roberto@x.com', professionalType: 'Medico', isActive: true, registrationNumber: 'CRM 8821-SP', createdAt: '2024-01-01', roles: [] },
];

const mockSubstitutions = [
  {
    id: 'sub-1111-aaaa', clinicId: 'c2', clinicName: 'UPA Centro',
    shiftDate: '2020-01-01T00:00:00Z', shiftLabel: 'Manhã (07h–19h)',
    shiftStartTime: '07:00:00', shiftEndTime: '19:00:00',
    reasonType: 'UnannouncedAbsence', reasonLabel: 'Ausência não comunicada',
    notes: 'Ausência sem comunicação prévia',
    absentUserId: 'u1', absentUserName: 'Dra. Renata Silva', absentUserRegistrationNumber: 'CRM 4478-SP',
    substituteUserId: null, substituteUserName: null, substituteUserRegistrationNumber: null,
    status: 'Pending', statusLabel: 'Pendente', isUrgent: true,
    confirmedAt: null, createdAt: '2020-01-01T00:00:00Z',
  },
  {
    id: 'sub-2222-bbbb', clinicId: 'c1', clinicName: 'UPA Vila Pereira',
    shiftDate: '2099-05-11T00:00:00Z', shiftLabel: 'Manhã (07h–19h)',
    shiftStartTime: '07:00:00', shiftEndTime: '19:00:00',
    reasonType: 'AdvanceNotice', reasonLabel: 'Aviso antecipado',
    notes: 'Consulta médica pessoal',
    absentUserId: 'u2', absentUserName: 'Dr. Marcelo Dias', absentUserRegistrationNumber: 'CRM 3345-SP',
    substituteUserId: null, substituteUserName: null, substituteUserRegistrationNumber: null,
    status: 'Pending', statusLabel: 'Pendente', isUrgent: false,
    confirmedAt: null, createdAt: '2099-05-01T00:00:00Z',
  },
  {
    id: 'sub-3333-cccc', clinicId: 'c1', clinicName: 'UPA Vila Pereira',
    shiftDate: '2099-05-09T00:00:00Z', shiftLabel: 'Noite (19h–07h)',
    shiftStartTime: '19:00:00', shiftEndTime: '07:00:00',
    reasonType: 'MedicalCertificate', reasonLabel: 'Atestado',
    notes: null,
    absentUserId: 'u3', absentUserName: 'Dra. Camila Ferraz', absentUserRegistrationNumber: 'CRM 3312-SP',
    substituteUserId: 'u2', substituteUserName: 'Dra. Jessica Lima', substituteUserRegistrationNumber: 'CRM 5485-SP',
    status: 'Confirmed', statusLabel: 'Confirmada', isUrgent: false,
    confirmedAt: '2099-05-08T14:32:00Z', createdAt: '2099-05-01T00:00:00Z',
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

function renderSubst(role: 'AdminGlobal' | 'AdminClinica' = 'AdminGlobal') {
  const user = role === 'AdminGlobal' ? mockAdminGlobal : mockAdminClinica;
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user, token: 'fake', isAuthenticated: true, loading: false,
    login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
  });
  return render(
    <div id="adm-root">
      <AdminSubstituicoes onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('<AdminSubstituicoes />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics);
    (usersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockUsers);
    (substitutionsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockSubstitutions);
    (substitutionsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockSubstitutions[0]);
    (substitutionsApi.assignSubstitute as ReturnType<typeof vi.fn>).mockResolvedValue(mockSubstitutions[0]);
  });

  // ── Renderização básica ────────────────────────────────────────────────────

  it('exibe título e subtítulo', async () => {
    renderSubst();
    expect(screen.getByText('Gestão de Substituições')).toBeInTheDocument();
    expect(screen.getByText('Substituições de Plantão')).toBeInTheDocument();
  });

  it('carrega dados do backend ao montar', async () => {
    renderSubst();
    await waitFor(() => {
      expect(clinicsApi.getAll).toHaveBeenCalled();
      expect(usersApi.getAll).toHaveBeenCalled();
      expect(substitutionsApi.getAll).toHaveBeenCalled();
    });
  });

  it('exibe os KPIs calculados a partir da lista', async () => {
    renderSubst();
    await waitFor(() => {
      expect(screen.getByText('Total no mês')).toBeInTheDocument();
    });
    // 3 total, 1 confirmada, 2 pendentes (1 urgente + 1 pendente normal), 1 urgente
    const values = document.querySelectorAll('.subst-kpi-val');
    const texts = Array.from(values).map(v => v.textContent);
    expect(texts).toEqual(['3', '1', '2', '1']);
  });

  it('exibe os cards de substituição carregados', async () => {
    renderSubst();
    await waitFor(() => {
      const list = document.querySelector('.subst-list') as HTMLElement;
      expect(list.textContent).toContain('Dra. Renata Silva');
      expect(list.textContent).toContain('Dr. Marcelo Dias');
      expect(list.textContent).toContain('Dra. Camila Ferraz');
    });
  });

  it('ordena substituições urgentes primeiro', async () => {
    renderSubst();
    await waitFor(() => {
      const cards = document.querySelectorAll('.subst-card');
      expect(cards[0].className).toContain('urgente');
    });
  });

  it('exibe mensagem de estado vazio quando não há substituições', async () => {
    (substitutionsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderSubst();
    await waitFor(() => {
      expect(screen.getByText('Nenhuma substituição encontrada.')).toBeInTheDocument();
    });
  });

  it('lida com erro de API graciosamente', async () => {
    (substitutionsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    (clinicsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    (usersApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderSubst();
    await waitFor(() => {
      expect(screen.getByText('Substituições de Plantão')).toBeInTheDocument();
    });
  });

  // ── Badges de status ───────────────────────────────────────────────────────

  it('exibe badge Urgente para substituição urgente', async () => {
    renderSubst();
    await waitFor(() => {
      expect(screen.getByText(/Urgente/)).toBeInTheDocument();
    });
  });

  it('exibe badge Confirmada para substituição com substituto', async () => {
    renderSubst();
    await waitFor(() => {
      expect(screen.getByText(/Confirmada/)).toBeInTheDocument();
    });
  });

  // ── Role-gating: AdminGlobal ───────────────────────────────────────────────

  it('AdminGlobal vê botão "Nova substituição"', async () => {
    renderSubst('AdminGlobal');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Nova substituição/ })).toBeInTheDocument();
    });
  });

  it('AdminGlobal NÃO vê badge "Somente leitura"', async () => {
    renderSubst('AdminGlobal');
    await waitFor(() => {
      expect(screen.queryByText('Somente leitura')).not.toBeInTheDocument();
    });
  });

  it('AdminGlobal vê botão "Designar substituto" nos cards pendentes', async () => {
    renderSubst('AdminGlobal');
    await waitFor(() => {
      expect(screen.getAllByText('Designar substituto').length).toBeGreaterThan(0);
    });
  });

  // ── Role-gating: AdminClinica ──────────────────────────────────────────────

  it('AdminClinica vê botão "Nova substituição" (própria UPA)', async () => {
    renderSubst('AdminClinica');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Nova substituição/ })).toBeInTheDocument();
    });
  });

  // ── Filtros ────────────────────────────────────────────────────────────────

  it('campo de busca está presente', async () => {
    renderSubst();
    expect(screen.getByPlaceholderText('Buscar por médico ou UPA...')).toBeInTheDocument();
  });

  it('filtra por texto de busca', async () => {
    renderSubst();
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.subst-list') as HTMLElement;
      expect(list.textContent).toContain('Dra. Renata Silva');
    });
    await user.type(screen.getByPlaceholderText('Buscar por médico ou UPA...'), 'Marcelo');
    await waitFor(() => {
      const list = document.querySelector('.subst-list') as HTMLElement;
      expect(list.textContent).not.toContain('Dra. Renata Silva');
      expect(list.textContent).toContain('Dr. Marcelo Dias');
    });
  });

  // ── Drawer: Nova substituição ───────────────────────────────────────────────

  it('abre drawer ao clicar em "Nova substituição"', async () => {
    renderSubst('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Nova substituição/ }));
    await user.click(screen.getByRole('button', { name: /Nova substituição/ }));
    expect(document.querySelector('.subst-drawer')).toHaveClass('open');
    expect(screen.getByText('Nova substituição', { selector: '.subst-drawer-title' })).toBeInTheDocument();
    expect(screen.getByText('Plantão original')).toBeInTheDocument();
  });

  it('fecha drawer ao clicar em Cancelar', async () => {
    renderSubst('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Nova substituição/ }));
    await user.click(screen.getByRole('button', { name: /Nova substituição/ }));
    await user.click(screen.getByText('Cancelar'));
    await waitFor(() => {
      expect(document.querySelector('.subst-drawer')).not.toHaveClass('open');
    });
  });

  it('botão de confirmar desabilitado sem médico ausente selecionado', async () => {
    renderSubst('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Nova substituição/ }));
    await user.click(screen.getByRole('button', { name: /Nova substituição/ }));
    const saveBtn = screen.getByText('Confirmar substituição');
    expect(saveBtn).toBeDisabled();
  });

  it('cria substituição ao preencher e confirmar', async () => {
    renderSubst('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Nova substituição/ }));
    await user.click(screen.getByRole('button', { name: /Nova substituição/ }));

    // Preencher data
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInput, '2099-06-01');

    // Selecionar médico ausente via CustomSelect — escopado ao drawer (4º select: UPA, Turno, Tipo, Médico)
    const drawerBody = document.querySelector('.subst-drawer-body') as HTMLElement;
    const cselects = drawerBody.querySelectorAll('.subst-cselect-btn');
    const medicoSelect = cselects[3] as HTMLElement;
    await user.click(medicoSelect);
    await waitFor(() => drawerBody.querySelector('.subst-cselect-dropdown'));
    const opt = drawerBody.querySelector('.subst-cselect-dropdown .subst-cselect-option') as HTMLElement;
    await user.click(opt);

    await waitFor(() => {
      const saveBtn = screen.getByText('Confirmar substituição');
      expect(saveBtn).not.toBeDisabled();
    });

    await user.click(screen.getByText('Confirmar substituição'));

    await waitFor(() => {
      expect(substitutionsApi.create).toHaveBeenCalledTimes(1);
    });
  });

  it('exibe toast de sucesso após criar substituição', async () => {
    renderSubst('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Nova substituição/ }));
    await user.click(screen.getByRole('button', { name: /Nova substituição/ }));

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInput, '2099-06-01');

    const drawerBody = document.querySelector('.subst-drawer-body') as HTMLElement;
    const cselects = drawerBody.querySelectorAll('.subst-cselect-btn');
    const medicoSelect = cselects[3] as HTMLElement;
    await user.click(medicoSelect);
    await waitFor(() => drawerBody.querySelector('.subst-cselect-dropdown'));
    const opt = drawerBody.querySelector('.subst-cselect-dropdown .subst-cselect-option') as HTMLElement;
    await user.click(opt);

    await user.click(screen.getByText('Confirmar substituição'));

    await waitFor(() => {
      const toastEl = document.querySelector('.subst-toast') as HTMLElement;
      expect(toastEl.textContent).toContain('Substituição registrada com sucesso');
    });
  });

  it('exibe toast de erro quando criação falha', async () => {
    (substitutionsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server Error'));
    renderSubst('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('button', { name: /Nova substituição/ }));
    await user.click(screen.getByRole('button', { name: /Nova substituição/ }));

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInput, '2099-06-01');

    const drawerBody = document.querySelector('.subst-drawer-body') as HTMLElement;
    const cselects = drawerBody.querySelectorAll('.subst-cselect-btn');
    const medicoSelect = cselects[3] as HTMLElement;
    await user.click(medicoSelect);
    await waitFor(() => drawerBody.querySelector('.subst-cselect-dropdown'));
    const opt = drawerBody.querySelector('.subst-cselect-dropdown .subst-cselect-option') as HTMLElement;
    await user.click(opt);

    await user.click(screen.getByText('Confirmar substituição'));

    await waitFor(() => {
      const toastEl = document.querySelector('.subst-toast') as HTMLElement;
      expect(toastEl.textContent).toContain('Erro ao registrar substituição');
    });
  });

  // ── Drawer: Designar substituto ─────────────────────────────────────────────

  it('abre drawer de designação ao clicar em "Designar substituto"', async () => {
    renderSubst('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getAllByText('Designar substituto'));
    await user.click(screen.getAllByText('Designar substituto')[0]);
    expect(document.querySelector('.subst-drawer')).toHaveClass('open');
    expect(screen.getByText('Designar substituto', { selector: '.subst-drawer-title' })).toBeInTheDocument();
  });

  it('designa substituto e chama a API corretamente', async () => {
    renderSubst('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => screen.getAllByText('Designar substituto'));
    await user.click(screen.getAllByText('Designar substituto')[0]);

    const drawerBody = document.querySelector('.subst-drawer-body') as HTMLElement;
    await waitFor(() => expect(drawerBody.textContent).toContain('Dra. Jessica Lima'));
    const option = Array.from(drawerBody.querySelectorAll('.subst-disp-item'))
      .find(el => el.textContent?.includes('Dra. Jessica Lima')) as HTMLElement;
    await user.click(option);
    await user.click(screen.getByText('Confirmar substituição'));

    await waitFor(() => {
      expect(substitutionsApi.assignSubstitute).toHaveBeenCalledTimes(1);
      expect(substitutionsApi.assignSubstitute).toHaveBeenCalledWith('sub-1111-aaaa', { substituteUserId: 'u2' });
    });
  });

  // ── Theme ─────────────────────────────────────────────────────────────────

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockAdminGlobal, token: 'fake', isAuthenticated: true, loading: false,
      login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
    });
    render(<div id="adm-root"><AdminSubstituicoes onBack={vi.fn()} dark={false} onToggleTheme={onToggle} /></div>);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Gestão de Substituições'));
    await user.click(document.querySelector('.theme-toggle') as HTMLElement);
    expect(onToggle).toHaveBeenCalled();
  });
});
