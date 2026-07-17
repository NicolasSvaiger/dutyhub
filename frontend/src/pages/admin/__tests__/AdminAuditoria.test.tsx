/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAuditoria } from '../AdminAuditoria';

// ── API mock ─────────────────────────────────────────────────────────────

vi.mock('../../../api/auditApi', () => ({
  auditApi: {
    getLogs: vi.fn(),
    getSummary: vi.fn(),
  },
}));

import { auditApi } from '../../../api/auditApi';
import type { AuditLogPage, AuditSummaryResponse } from '../../../api/auditApi';

// jsdom não implementa canvas
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), arc: vi.fn(), setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillText: vi.fn(),
    strokeStyle: '', fillStyle: '', lineWidth: 0, font: '', textAlign: '',
  })) as unknown as HTMLCanvasElement['getContext'];
});

// ── Fixtures ─────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const mockSummary: AuditSummaryResponse = {
  kpis: { totalEvents: 1847, creates: 312, updates: 904, deletes: 41, logins: 590 },
  modules: [
    { module: 'Escalas', count: 342, color: '#6366f1' },
    { module: 'Médicos', count: 218, color: '#2DBFB8' },
    { module: 'Justificativas', count: 156, color: '#f59e0b' },
  ],
  topUsers: [
    { userId: 'u1', userName: 'Sileide G. Rocha', initials: 'SR', role: 'AdminGlobal', count: 612, color: '#6366f1' },
    { userId: 'u2', userName: 'Carlos Mendes',    initials: 'CM', role: 'AdminClinica', count: 445, color: '#2DBFB8' },
  ],
  last7Days: [
    { date: '2026-05-05', dayLabel: 'S', count: 148 },
    { date: '2026-05-06', dayLabel: 'T', count: 212 },
    { date: '2026-05-07', dayLabel: 'Q', count: 175 },
    { date: '2026-05-08', dayLabel: 'Q', count: 263 },
    { date: '2026-05-09', dayLabel: 'S', count: 198 },
    { date: '2026-05-10', dayLabel: 'S', count: 244 },
    { date: '2026-05-11', dayLabel: 'D', count: 231 },
  ],
};

const mockPage: AuditLogPage = {
  items: [
    {
      id: 'evt-1',
      timestamp: '2026-05-11T11:23:14Z',
      dateLabel: today(),
      timeLabel: '11:23:14',
      userId: 'u1',
      userName: 'Sileide G. Rocha',
      userInitials: 'SR',
      userRole: 'AdminGlobal',
      operation: 'Update',
      operationLabel: 'Edição',
      module: 'Configurações',
      entity: 'SystemSettings',
      entityId: 'singleton',
      action: 'Tolerância de atraso alterada',
      details: 'Tolerância global alterada de 10 min para 15 min',
      ipAddress: '189.14.55.22',
      beforeValue: '10 min',
      afterValue: '15 min',
    },
    {
      id: 'evt-2',
      timestamp: '2026-05-11T11:20:08Z',
      dateLabel: today(),
      timeLabel: '11:20:08',
      userId: 'u1',
      userName: 'Sileide G. Rocha',
      userInitials: 'SR',
      userRole: 'AdminGlobal',
      operation: 'Login',
      operationLabel: 'Login',
      module: 'Acesso',
      entity: 'User',
      entityId: 'u1',
      action: 'Login no sistema',
      details: 'MFA validado com sucesso',
      ipAddress: '189.14.55.22',
      beforeValue: null,
      afterValue: null,
    },
    {
      id: 'evt-3',
      timestamp: '2026-05-10T18:55:03Z',
      dateLabel: '10/05/2026',
      timeLabel: '18:55:03',
      userId: 'u3',
      userName: 'Patrícia Lima',
      userInitials: 'PL',
      userRole: 'RH',
      operation: 'Create',
      operationLabel: 'Criação',
      module: 'Médicos',
      entity: 'User',
      entityId: 'x',
      action: 'Médico cadastrado — Dr. Lucas Prado',
      details: null,
      ipAddress: '200.148.3.91',
      beforeValue: null,
      afterValue: 'Ativo',
    },
  ],
  totalCount: 3,
  page: 1,
  pageSize: 30,
  totalPages: 1,
};

function renderPage(props: Partial<React.ComponentProps<typeof AdminAuditoria>> = {}) {
  return render(
    <div id="adm-root">
      <AdminAuditoria
        onBack={vi.fn()}
        dark={false}
        onToggleTheme={vi.fn()}
        onOpenSidebar={vi.fn()}
        {...props}
      />
    </div>,
  );
}

async function waitForLoaded() {
  await waitFor(() => {
    expect(document.querySelector('.aud-log-feed')).toBeInTheDocument();
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('<AdminAuditoria />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auditApi.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue(mockSummary);
    (auditApi.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue(mockPage);
  });

  it('exibe título e subtítulo', async () => {
    renderPage();
    expect(screen.getByText('Auditoria e Logs')).toBeInTheDocument();
    await waitForLoaded();
  });

  it('mostra loading e depois carrega dados', async () => {
    renderPage();
    expect(screen.getByText(/Carregando eventos/i)).toBeInTheDocument();
    await waitForLoaded();
  });

  it('renderiza os 5 KPIs do topo', async () => {
    renderPage();
    await waitForLoaded();
    const kpis = document.querySelectorAll('.aud-kpi-s .aud-kpi-val');
    expect(kpis.length).toBe(5);
    expect(kpis[0]).toHaveTextContent('1847');
    expect(kpis[1]).toHaveTextContent('312');
    expect(kpis[2]).toHaveTextContent('904');
    expect(kpis[3]).toHaveTextContent('41');
    expect(kpis[4]).toHaveTextContent('590');
  });

  it('renderiza os eventos agrupados por data', async () => {
    renderPage();
    await waitForLoaded();
    const items = document.querySelectorAll('.aud-log-item');
    expect(items.length).toBe(3);
    // 2 grupos de data (hoje e 10/05)
    const groups = document.querySelectorAll('.aud-log-date-group');
    expect(groups.length).toBe(2);
  });

  it('mostra badge de tipo correta em cada item', async () => {
    renderPage();
    await waitForLoaded();
    expect(document.querySelector('.aud-badge.ger-badge-editar')).toBeInTheDocument();
    expect(document.querySelector('.aud-badge.ger-badge-login')).toBeInTheDocument();
    expect(document.querySelector('.aud-badge.ger-badge-criar')).toBeInTheDocument();
  });

  it('renderiza atividade por módulo com barras', async () => {
    renderPage();
    await waitForLoaded();
    const rows = document.querySelectorAll('.aud-modulo-row');
    expect(rows.length).toBe(3);
    expect(rows[0]).toHaveTextContent('Escalas');
    expect(rows[0]).toHaveTextContent('342');
  });

  it('renderiza usuários mais ativos', async () => {
    renderPage();
    await waitForLoaded();
    const items = document.querySelectorAll('.aud-user-item');
    expect(items.length).toBe(2);
    expect(items[0]).toHaveTextContent('Sileide G. Rocha');
    expect(items[0]).toHaveTextContent('612');
  });

  it('renderiza sparkline canvas', async () => {
    renderPage();
    await waitForLoaded();
    expect(document.querySelector('.aud-spark')).toBeInTheDocument();
  });

  it('abre panel de detalhes ao clicar em um item', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    const first = document.querySelector('.aud-log-item') as HTMLElement;
    await user.click(first);

    expect(screen.getByText('Detalhes do evento')).toBeInTheDocument();
    expect(screen.getByText('ID do evento')).toBeInTheDocument();
    expect(screen.getByText('evt-1')).toBeInTheDocument();
    expect(screen.getByText('Valor anterior')).toBeInTheDocument();
    expect(screen.getAllByText('10 min').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15 min').length).toBeGreaterThan(0);
  });

  it('fecha panel de detalhes ao clicar no X', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    const first = document.querySelector('.aud-log-item') as HTMLElement;
    await user.click(first);
    expect(screen.getByText('Detalhes do evento')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Fechar detalhes/i }));
    expect(screen.queryByText('Detalhes do evento')).not.toBeInTheDocument();
  });

  it('aplica filtros ao clicar em Buscar', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    (auditApi.getLogs as ReturnType<typeof vi.fn>).mockClear();
    const select = document.querySelectorAll('.aud-filter-select')[2] as HTMLSelectElement; // tipo de ação (3º select)
    await user.selectOptions(select, 'Update');
    await user.click(screen.getByRole('button', { name: /^Buscar$/i }));

    await waitFor(() => {
      expect(auditApi.getLogs).toHaveBeenCalledWith(expect.objectContaining({ operation: 'Update' }));
    });
  });

  it('limpa filtros ao clicar em Limpar', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    const search = document.querySelector('.aud-filter-search input') as HTMLInputElement;
    await user.type(search, 'teste');
    expect(search.value).toBe('teste');

    (auditApi.getLogs as ReturnType<typeof vi.fn>).mockClear();
    await user.click(screen.getByRole('button', { name: /Limpar/i }));
    expect(search.value).toBe('');
    await waitFor(() => {
      expect(auditApi.getLogs).toHaveBeenCalled();
    });
  });

  it('mostra empty state quando não há eventos', async () => {
    (auditApi.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [], totalCount: 0, page: 1, pageSize: 30, totalPages: 0,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Nenhum evento encontrado/i)).toBeInTheDocument();
    });
  });

  it('lida com falha na API silenciosamente', async () => {
    (auditApi.getSummary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    (auditApi.getLogs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Nenhum evento encontrado/i)).toBeInTheDocument();
    });
  });

  it('mostra toast ao clicar em Exportar Excel', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();
    await user.click(screen.getByRole('button', { name: /Exportar Excel/i }));
    expect(screen.getByText(/exportados em Excel/i)).toBeInTheDocument();
  });

  it('mostra toast ao clicar em Exportar PDF', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();
    await user.click(screen.getByRole('button', { name: /Exportar PDF/i }));
    expect(screen.getByText(/exportados em PDF/i)).toBeInTheDocument();
  });

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();
    renderPage({ onToggleTheme });
    await waitForLoaded();

    await user.click(screen.getByRole('button', { name: /Tema escuro|Tema claro/i }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('chama onOpenSidebar ao clicar no hamburger', async () => {
    const user = userEvent.setup();
    const onOpenSidebar = vi.fn();
    renderPage({ onOpenSidebar });
    await waitForLoaded();

    const hamburger = document.querySelector('.aud-hamburger') as HTMLButtonElement;
    await user.click(hamburger);
    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it('popula selects de filtro com módulos/usuários do summary', async () => {
    renderPage();
    await waitForLoaded();
    const selects = document.querySelectorAll('.aud-filter-select');
    // 0 = usuário, 1 = módulo, 2 = tipo
    const userSelect = selects[0] as HTMLSelectElement;
    const moduleSelect = selects[1] as HTMLSelectElement;
    expect(Array.from(userSelect.options).map(o => o.textContent)).toContain('Sileide G. Rocha');
    expect(Array.from(moduleSelect.options).map(o => o.textContent)).toContain('Escalas');
  });

  it('avança para próxima página ao clicar em Próxima', async () => {
    (auditApi.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPage,
      totalCount: 60,
      totalPages: 2,
    });
    const user = userEvent.setup();
    renderPage();
    await waitForLoaded();

    (auditApi.getLogs as ReturnType<typeof vi.fn>).mockClear();
    await user.click(screen.getByRole('button', { name: /Próxima página/i }));
    await waitFor(() => {
      expect(auditApi.getLogs).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });
  });
});
