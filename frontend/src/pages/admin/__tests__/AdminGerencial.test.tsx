/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminGerencial } from '../AdminGerencial';

// ── API mock ─────────────────────────────────────────────────────────────

vi.mock('../../../api/managementReportApi', () => ({
  managementReportApi: {
    getReport: vi.fn(),
  },
}));

import { managementReportApi } from '../../../api/managementReportApi';
import type { ManagementReportResponse } from '../../../api/managementReportApi';

// ── jsdom não implementa canvas — mockamos o getContext p/ o gráfico não quebrar
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

const mockReport: ManagementReportResponse = {
  year: 2026,
  month: 5,
  periodLabel: 'Maio 2026',
  slaGlobal: { value: 88.6, delta: 2.1, direction: 'up', label: '↑ +2,1% vs mês anterior' },
  totalAbsences: { value: 28, delta: 4, direction: 'down', label: '↑ +4 vs mês anterior' },
  totalLateEvents: { value: 20, delta: -3, direction: 'up', label: '↓ 3 vs mês anterior' },
  contractsInSla: { inSla: 1, total: 2, direction: 'flat', label: '→ Igual ao mês anterior' },
  contracts: [
    {
      contractId: 'ct1',
      contractNumber: 'CT-2024-0087',
      publicOrganName: 'Prefeitura de São Paulo',
      startDate: '2024-01-01', endDate: '2026-12-31',
      slaPercent: 88.6, targetPercent: 90,
      clinicCount: 2, absenceCount: 18, monthlyValue: 220_000,
      status: 'warn',
    },
    {
      contractId: 'ct2',
      contractNumber: 'CT-2023-0142',
      publicOrganName: 'Prefeitura de Guarulhos',
      startDate: '2023-07-01', endDate: '2026-06-30',
      slaPercent: 81.4, targetPercent: 85,
      clinicCount: 2, absenceCount: 10, monthlyValue: 160_000,
      status: 'crit',
    },
  ],
  clinicRanking: [
    { clinicId: 'c1', clinicName: 'Vila Pereira', slaPercent: 97, position: 1 },
    { clinicId: 'c2', clinicName: 'Zona Norte',   slaPercent: 94, position: 2 },
    { clinicId: 'c3', clinicName: 'Centro',       slaPercent: 82, position: 3 },
    { clinicId: 'c4', clinicName: 'Zona Sul',     slaPercent: 81, position: 4 },
  ],
  problemDoctors: [
    { userId: 'u1', userName: 'Dra. Renata Silva', initials: 'RS', clinicName: 'Centro', occurrenceCount: 11, absenceCount: 8, lateCount: 3 },
    { userId: 'u2', userName: 'Dr. Marcelo Dias',  initials: 'MD', clinicName: 'Zona Sul', occurrenceCount: 9,  absenceCount: 5, lateCount: 4 },
  ],
  trends: [
    { key: 'sla-trend',        label: 'Tendência SLA',    value: 'Melhora',      subLabel: 'vs mês anterior',        direction: 'up' },
    { key: 'critical-doctors', label: 'Médicos críticos', value: '3 profissionais', subLabel: 'com 5+ ocorrências', direction: 'flat' },
    { key: 'top-clinic',       label: 'UPA em destaque',  value: 'Vila Pereira', subLabel: '97% de cumprimento',     direction: 'up' },
    { key: 'alert-clinic',     label: 'UPA com alerta',   value: 'Zona Sul',     subLabel: '81% — abaixo da meta',   direction: 'down' },
    { key: 'substitutions',    label: 'Substituições',    value: '12 no mês',    subLabel: 'cobertas total ou parcialmente', direction: 'flat' },
    { key: 'justifications',   label: 'Justificativas',   value: '5 pendentes',  subLabel: 'prazo ativo',            direction: 'flat' },
  ],
  evolution: {
    months: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai'],
    contractSeries: [
      { contractId: 'ct1', label: 'Prefeitura de São Paulo', color: '#6366f1', values: [89.2, 90.1, 91.3, 91.8, 88.6] },
      { contractId: 'ct2', label: 'Prefeitura de Guarulhos', color: '#f97316', values: [74.1, 76.8, 78.2, 79.5, 81.4] },
    ],
    absencesByMonth: [38, 34, 31, 24, 28],
  },
  highlights: [
    { kind: 'pos', text: 'UPA Vila Pereira com melhor desempenho: 97,0% de cumprimento de escala.' },
    { kind: 'neg', text: 'Dra. Renata Silva com 8 ausências no período. Acionamento formal pendente.' },
    { kind: 'neu', text: 'Contrato Prefeitura de Guarulhos vence em 45 dias. Iniciar tratativas de renovação.' },
  ],
};

function renderPage(props: Partial<React.ComponentProps<typeof AdminGerencial>> = {}) {
  return render(
    <div id="adm-root">
      <AdminGerencial
        onBack={vi.fn()}
        dark={false}
        onToggleTheme={vi.fn()}
        onOpenSidebar={vi.fn()}
        {...props}
      />
    </div>,
  );
}

async function waitForReport() {
  await waitFor(() => {
    expect(document.querySelector('.ger-kpi-hero')).toBeInTheDocument();
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('<AdminGerencial />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (managementReportApi.getReport as ReturnType<typeof vi.fn>).mockResolvedValue(mockReport);
  });

  it('exibe título e subtítulo', async () => {
    renderPage();
    expect(screen.getByText('Relatório Gerencial')).toBeInTheDocument();
    await waitForReport();
  });

  it('mostra loading inicialmente e depois carrega dados', async () => {
    renderPage();
    expect(screen.getByText(/Carregando relatório/i)).toBeInTheDocument();
    await waitForReport();
    expect(screen.queryByText(/Carregando relatório/i)).not.toBeInTheDocument();
  });

  it('renderiza os 4 KPIs do topo', async () => {
    renderPage();
    await waitForReport();
    expect(screen.getByText('SLA global OS')).toBeInTheDocument();
    expect(screen.getByText('Total de ausências')).toBeInTheDocument();
    expect(screen.getByText('Atrasos registrados')).toBeInTheDocument();
    expect(screen.getByText('Contratos no SLA')).toBeInTheDocument();
    // Valores das KPIs — escopa dentro dos cards hero (evita ambiguidade com
    // "88,6%" que aparece também no badge do período e no card de contrato)
    const heroCards = document.querySelectorAll('.ger-kpi-hcard .ger-kpi-hval');
    expect(heroCards[0]).toHaveTextContent('88,6%');
    expect(heroCards[1]).toHaveTextContent('28');
    expect(heroCards[2]).toHaveTextContent('20');
    expect(heroCards[3]).toHaveTextContent('1 / 2');
  });

  it('renderiza cards de contrato com nome e badge de status', async () => {
    renderPage();
    await waitForReport();
    expect(screen.getByText('Prefeitura de São Paulo')).toBeInTheDocument();
    expect(screen.getByText('Prefeitura de Guarulhos')).toBeInTheDocument();
    expect(screen.getByText(/⚠ Abaixo da meta/i)).toBeInTheDocument();
    expect(screen.getByText(/● Crítico/i)).toBeInTheDocument();
  });

  it('renderiza ranking de UPAs em ordem', async () => {
    renderPage();
    await waitForReport();
    const items = document.querySelectorAll('.ger-upa-rank-item');
    expect(items.length).toBe(4);
    expect(items[0]).toHaveTextContent('Vila Pereira');
    expect(items[0]).toHaveTextContent('97,0%');
    expect(items[3]).toHaveTextContent('Zona Sul');
  });

  it('renderiza lista de médicos com ocorrências', async () => {
    renderPage();
    await waitForReport();
    expect(screen.getByText('Dra. Renata Silva')).toBeInTheDocument();
    expect(screen.getByText('Dr. Marcelo Dias')).toBeInTheDocument();
    expect(screen.getByText('11 oc.')).toBeInTheDocument();
    expect(screen.getByText('9 oc.')).toBeInTheDocument();
  });

  it('renderiza os 6 cards de tendências', async () => {
    renderPage();
    await waitForReport();
    const cards = document.querySelectorAll('.ger-tend-card');
    expect(cards.length).toBe(6);
    expect(screen.getByText('Tendência SLA')).toBeInTheDocument();
    expect(screen.getByText('Médicos críticos')).toBeInTheDocument();
    expect(screen.getByText('UPA em destaque')).toBeInTheDocument();
    expect(screen.getByText('UPA com alerta')).toBeInTheDocument();
  });

  it('renderiza pontos para reunião com kinds diferentes', async () => {
    renderPage();
    await waitForReport();
    expect(document.querySelector('.ger-dest-item.pos')).toBeInTheDocument();
    expect(document.querySelector('.ger-dest-item.neg')).toBeInTheDocument();
    expect(document.querySelector('.ger-dest-item.neu')).toBeInTheDocument();
  });

  it('renderiza canvas de evolução', async () => {
    renderPage();
    await waitForReport();
    expect(document.querySelector('.ger-chart-wrap canvas')).toBeInTheDocument();
  });

  it('renderiza tabs de período com 5 meses', async () => {
    renderPage();
    await waitForReport();
    const tabs = document.querySelectorAll('.ger-periodo-tab');
    expect(tabs.length).toBe(5);
  });

  it('troca de período ao clicar em outra tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForReport();

    (managementReportApi.getReport as ReturnType<typeof vi.fn>).mockClear();
    const tabs = document.querySelectorAll('.ger-periodo-tab');
    // Clica na primeira tab (que não é o mês atual)
    await user.click(tabs[0] as HTMLElement);

    await waitFor(() => {
      expect(managementReportApi.getReport).toHaveBeenCalled();
    });
  });

  it('mostra empty state quando API falha', async () => {
    (managementReportApi.getReport as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar/i)).toBeInTheDocument();
    });
  });

  it('mostra toast ao clicar em Exportar PDF', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForReport();

    const btn = screen.getByRole('button', { name: /Exportar PDF/i });
    await user.click(btn);
    expect(screen.getByText(/Relatório PDF gerado/i)).toBeInTheDocument();
  });

  it('mostra toast ao clicar em Apresentação', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForReport();

    const btn = screen.getByRole('button', { name: /Apresentação/i });
    await user.click(btn);
    expect(screen.getByText(/Apresentação gerada/i)).toBeInTheDocument();
  });

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();
    renderPage({ onToggleTheme });
    await waitForReport();

    await user.click(screen.getByRole('button', { name: /Tema escuro|Tema claro/i }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('chama onOpenSidebar ao clicar no hamburger', async () => {
    const user = userEvent.setup();
    const onOpenSidebar = vi.fn();
    renderPage({ onOpenSidebar });
    await waitForReport();

    const hamburger = document.querySelector('.ger-hamburger') as HTMLButtonElement;
    expect(hamburger).toBeInTheDocument();
    await user.click(hamburger);
    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it('formata valor monetário nos cards de contrato', async () => {
    renderPage();
    await waitForReport();
    // 220000 → R$220k
    expect(screen.getByText('R$220k')).toBeInTheDocument();
    expect(screen.getByText('R$160k')).toBeInTheDocument();
  });

  it('exibe legenda do gráfico com nomes dos contratos', async () => {
    renderPage();
    await waitForReport();
    const legend = document.querySelector('.ger-chart-legend');
    expect(legend).toHaveTextContent('Prefeitura de São Paulo');
    expect(legend).toHaveTextContent('Prefeitura de Guarulhos');
    expect(legend).toHaveTextContent('Ausências (qtd)');
  });
});
