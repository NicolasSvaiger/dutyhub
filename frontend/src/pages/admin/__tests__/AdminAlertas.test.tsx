/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAlertas } from '../AdminAlertas';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { alertsApi } from '../../../api/alertsApi';
import { useAuth } from '../../../hooks/useAuth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSummary = {
  totalToday: 5,
  totalAll: 10,
  openCritical: 2,
  openWarning: 3,
  openInfo: 1,
  resolvedToday: 3,
};

const mockAlerts = [
  {
    id: 'a1', code: 'ALT-2026-041',
    level: 'Critical' as const, levelLabel: 'Crítico',
    type: 'UncoveredShift' as const, typeLabel: 'Turno descoberto',
    title: 'Turno da noite sem cobertura',
    description: 'Nenhum médico está escalado para o turno <strong>19h–07h</strong>.',
    clinicId: 'c1', clinicName: 'UPA Centro',
    relatedUserId: null, relatedUserName: null,
    primaryActionLabel: 'Designar substituto',
    secondaryActionLabel: 'Ver escalas',
    isResolved: false,
    resolvedAt: null, resolvedByUserId: null, resolvedByUserName: null, resolutionNotes: null,
    createdAt: '2020-01-01T10:00:00Z',
  },
  {
    id: 'a2', code: 'ALT-2026-040',
    level: 'Critical' as const, levelLabel: 'Crítico',
    type: 'UnannouncedAbsence' as const, typeLabel: 'Ausência',
    title: 'Ausência não comunicada — Dra. Renata',
    description: 'Não realizou check-in.',
    clinicId: 'c1', clinicName: 'UPA Centro',
    relatedUserId: 'u1', relatedUserName: 'Dra. Renata Silva',
    primaryActionLabel: 'Registrar substituição',
    secondaryActionLabel: 'Notificar médico',
    isResolved: false,
    resolvedAt: null, resolvedByUserId: null, resolvedByUserName: null, resolutionNotes: null,
    createdAt: '2020-01-01T07:00:00Z',
  },
  {
    id: 'a3', code: 'ALT-2026-039',
    level: 'Warning' as const, levelLabel: 'Atenção',
    type: 'Delay' as const, typeLabel: 'Atraso',
    title: 'Atraso de 38 min — Dr. Marcelo',
    description: 'Atraso registrado.',
    clinicId: 'c2', clinicName: 'UPA Vila Pereira',
    relatedUserId: 'u2', relatedUserName: 'Dr. Marcelo Dias',
    primaryActionLabel: 'Registrar ocorrência',
    secondaryActionLabel: 'Ver histórico',
    isResolved: false,
    resolvedAt: null, resolvedByUserId: null, resolvedByUserName: null, resolutionNotes: null,
    createdAt: '2020-01-01T09:00:00Z',
  },
  {
    id: 'a4', code: 'ALT-2026-034',
    level: 'Resolved' as const, levelLabel: 'Resolvido',
    type: 'UncoveredShift' as const, typeLabel: 'Turno descoberto',
    title: 'Substituto designado',
    description: 'Turno garantido.',
    clinicId: 'c2', clinicName: 'UPA Vila Pereira',
    relatedUserId: null, relatedUserName: null,
    primaryActionLabel: null, secondaryActionLabel: 'Ver substituição',
    isResolved: true,
    resolvedAt: '2020-01-01T08:00:00Z', resolvedByUserId: 'admin', resolvedByUserName: 'Admin', resolutionNotes: null,
    createdAt: '2020-01-01T06:00:00Z',
  },
];

const mockAdminGlobal = {
  userId: 'u-admin', email: 'admin@24p7.com', name: 'Admin',
  roles: ['AdminGlobal'], clinicId: null, clinicIds: [],
};

const mockMedico = {
  userId: 'u-med', email: 'med@24p7.com', name: 'Dr. Test',
  roles: ['Medico'], clinicId: null, clinicIds: [],
};

function renderPage(role: 'AdminGlobal' | 'Medico' = 'AdminGlobal') {
  const authUser = role === 'AdminGlobal' ? mockAdminGlobal : mockMedico;
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: authUser, token: 'fake', isAuthenticated: true, loading: false,
    login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
  });
  return render(
    <div id="adm-root">
      <AdminAlertas onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('<AdminAlertas />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (alertsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockAlerts);
    (alertsApi.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue(mockSummary);
    (alertsApi.resolve as ReturnType<typeof vi.fn>).mockResolvedValue(mockAlerts[0]);
    (alertsApi.resolveAll as ReturnType<typeof vi.fn>).mockResolvedValue({ resolved: 5 });
  });

  it('renderiza título e subtítulo', async () => {
    renderPage();
    expect(screen.getByText('Central de Alertas')).toBeInTheDocument();
  });

  it('carrega alertas e summary ao montar', async () => {
    renderPage();
    await waitFor(() => {
      expect(alertsApi.getAll).toHaveBeenCalled();
      expect(alertsApi.getSummary).toHaveBeenCalled();
    });
  });

  it('exibe KPIs com os valores do summary', async () => {
    renderPage();
    await waitFor(() => {
      const kpis = document.querySelectorAll('.alt-kpi-val');
      // ordem: todos, critico, atencao, info, resolvido
      const values = Array.from(kpis).map(el => el.textContent);
      expect(values).toEqual(['10', '2', '3', '1', '3']);
    });
  });

  it('exibe os alertas na lista', async () => {
    renderPage();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list.textContent).toContain('Turno da noite sem cobertura');
      expect(list.textContent).toContain('Ausência não comunicada — Dra. Renata');
      expect(list.textContent).toContain('Atraso de 38 min — Dr. Marcelo');
    });
  });

  it('filtra por KPI de crítico', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    // click no KPI Crítico
    const kpiCritico = document.querySelector('.alt-kpi.critico') as HTMLElement;
    await user.click(kpiCritico);

    await waitFor(() => {
      // Só críticos (2 alertas)
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list.textContent).toContain('Turno da noite sem cobertura');
      expect(list.textContent).toContain('Ausência não comunicada');
      expect(list.textContent).not.toContain('Atraso de 38 min');
      expect(list.textContent).not.toContain('Substituto designado');
    });
  });

  it('filtra por KPI de resolvidos', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    const kpiResolvido = document.querySelector('.alt-kpi.resolvido') as HTMLElement;
    await user.click(kpiResolvido);

    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list.textContent).toContain('Substituto designado');
      expect(list.textContent).not.toContain('Turno da noite sem cobertura');
    });
  });

  it('filtra por tipo Ausência via tab', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    await user.click(screen.getByRole('button', { name: 'Ausência' }));

    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list.textContent).toContain('Ausência não comunicada');
      expect(list.textContent).not.toContain('Turno da noite sem cobertura');
    });
  });

  it('filtra por busca', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    await user.type(screen.getByPlaceholderText('Buscar alerta...'), 'Marcelo');

    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list.textContent).toContain('Atraso de 38 min — Dr. Marcelo');
      expect(list.textContent).not.toContain('Turno da noite sem cobertura');
    });
  });

  it('resolve alerta ao clicar no botão Resolver', async () => {
    renderPage('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    const resolveButtons = screen.getAllByRole('button', { name: /Resolver/ });
    await user.click(resolveButtons[0]);

    await waitFor(() => {
      expect(alertsApi.resolve).toHaveBeenCalledWith('a1', undefined);
    });
  });

  it('mostra toast de sucesso após resolver', async () => {
    renderPage('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    const resolveButtons = screen.getAllByRole('button', { name: /Resolver/ });
    await user.click(resolveButtons[0]);

    await waitFor(() => {
      const toast = document.querySelector('.alt-toast') as HTMLElement;
      expect(toast.textContent).toContain('resolvido');
    });
  });

  it('abre modal ao clicar em ação primária', async () => {
    renderPage('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    const primaryButtons = screen.getAllByRole('button', { name: 'Designar substituto' });
    await user.click(primaryButtons[0]);

    await waitFor(() => {
      expect(document.querySelector('.alt-modal-box')).not.toBeNull();
      // modal-title tem "Designar substituto"
      const modalTitle = document.querySelector('.alt-modal-title') as HTMLElement;
      expect(modalTitle.textContent).toBe('Designar substituto');
    });
  });

  it('confirma resolução no modal envia notes', async () => {
    renderPage('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    await user.click(screen.getAllByRole('button', { name: 'Designar substituto' })[0]);
    await waitFor(() => document.querySelector('.alt-modal-textarea'));

    const textarea = document.querySelector('.alt-modal-textarea') as HTMLTextAreaElement;
    await user.type(textarea, 'Dr. Roberto designado');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(alertsApi.resolve).toHaveBeenCalledWith('a1', { resolutionNotes: 'Dr. Roberto designado' });
    });
  });

  it('fecha modal ao clicar em Cancelar', async () => {
    renderPage('AdminGlobal');
    const user = userEvent.setup();
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    await user.click(screen.getAllByRole('button', { name: 'Designar substituto' })[0]);
    await waitFor(() => document.querySelector('.alt-modal-box'));

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(document.querySelector('.alt-modal-box')).toBeNull();
    });
  });

  it('esconde botões de ação para usuário sem privilégio (Médico)', async () => {
    renderPage('Medico');
    await waitFor(() => {
      const list = document.querySelector('.alt-list') as HTMLElement;
      expect(list?.textContent).toContain('Turno da noite sem cobertura');
    });

    // Médico não vê "Marcar todos como resolvido" nem botão "Resolver" nem ação primária
    expect(screen.queryByRole('button', { name: /Marcar todos como resolvido/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Resolver$/ })).not.toBeInTheDocument();
  });

  it('lida com erro de API graciosamente', async () => {
    (alertsApi.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    (alertsApi.getSummary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nenhum alerta encontrado')).toBeInTheDocument();
    });
  });

  it('mostra painel lateral com estatísticas', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Hoje em números')).toBeInTheDocument();
      expect(screen.getByText('Timeline recente')).toBeInTheDocument();
      expect(screen.getByText('Turnos descobertos')).toBeInTheDocument();
    });
  });

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: mockAdminGlobal, token: 'fake', isAuthenticated: true, loading: false,
      login: vi.fn(), logout: vi.fn(), pendingChallenge: null, challengeUser: null, clearChallenge: vi.fn(),
    });
    render(<div id="adm-root"><AdminAlertas onBack={vi.fn()} dark={false} onToggleTheme={onToggle} /></div>);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText('Central de Alertas'));
    await user.click(document.querySelector('.theme-toggle') as HTMLElement);
    expect(onToggle).toHaveBeenCalled();
  });
});
