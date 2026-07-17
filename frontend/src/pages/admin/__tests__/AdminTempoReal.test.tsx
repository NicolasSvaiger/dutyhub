/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminTempoReal } from '../AdminTempoReal';

// ─── API mocks ────────────────────────────────────────────────────────────

vi.mock('../../../api/attendanceApi', () => ({
  attendanceApi: {
    getLiveStatus: vi.fn(),
  },
}));

import { attendanceApi } from '../../../api/attendanceApi';
import type { LiveStatusResponse } from '../../../api/attendanceApi';

// ─── Fixtures ─────────────────────────────────────────────────────────────

const clinicOk: LiveStatusResponse['clinics'][number] = {
  clinicId: 'c1',
  clinicName: 'UPA Vila Pereira',
  contractId: 'ct1',
  contractNumber: 'CT-2024-0087',
  publicOrganName: 'Pref. São Paulo',
  status: 'Ok',
  shifts: [
    {
      shiftId: 's1',
      title: 'Plantão Manhã',
      startTime: '07:00:00',
      endTime: '19:00:00',
      isActive: true,
      professionals: [
        { userId: 'u1', userName: 'Dra. Jessica Lima', status: 'Presente', checkInTime: '2026-07-12T10:02:00Z' },
      ],
      openSlots: 0,
    },
  ],
  presentCount: 1,
  lateCount: 0,
  absentCount: 0,
  openSlotsCount: 0,
  slaPercent: 100,
  lastEventDescription: 'Dra. Jessica Lima check-in 10:02',
  lastEventTime: '2026-07-12T10:02:00Z',
};

const clinicCritico: LiveStatusResponse['clinics'][number] = {
  clinicId: 'c2',
  clinicName: 'UPA Centro',
  contractId: 'ct1',
  contractNumber: 'CT-2024-0087',
  publicOrganName: 'Pref. São Paulo',
  status: 'Critico',
  shifts: [
    {
      shiftId: 's2',
      title: 'Plantão Manhã',
      startTime: '07:00:00',
      endTime: '19:00:00',
      isActive: true,
      professionals: [
        { userId: 'u2', userName: 'Dra. Renata Silva', status: 'Ausente', checkInTime: null },
      ],
      openSlots: 1,
    },
  ],
  presentCount: 0,
  lateCount: 0,
  absentCount: 1,
  openSlotsCount: 1,
  slaPercent: 0,
  lastEventDescription: null,
  lastEventTime: null,
};

const mockResponse: LiveStatusResponse = {
  clinics: [clinicOk, clinicCritico],
  recentEvents: [
    { time: '2026-07-12T10:02:00Z', type: 'ok', description: 'Dra. Jessica Lima check-in 10:02', clinicName: 'UPA Vila Pereira' },
  ],
  totalPresent: 1,
  totalLate: 0,
  totalAbsent: 1,
  totalOpenSlots: 1,
  overallSlaPercent: 50,
};

function renderPage() {
  return render(
    <div id="adm-root">
      <AdminTempoReal onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} />
    </div>
  );
}

/** "UPA Vila Pereira" aparece no card E no feed de eventos — aguarda pelo card especificamente. */
async function waitForCards() {
  await waitFor(() => {
    const card = document.querySelector('.tr-upa-nome');
    expect(card).toBeInTheDocument();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('<AdminTempoReal />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (attendanceApi.getLiveStatus as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);
  });

  it('exibe o título da página', async () => {
    renderPage();
    expect(screen.getByText('Tempo Real — Todos os Contratos')).toBeInTheDocument();
    await waitForCards();
  });

  it('exibe estado de carregamento antes dos dados chegarem', () => {
    renderPage();
    expect(screen.getByText('Carregando painel…')).toBeInTheDocument();
  });

  it('carrega e exibe as UPAs retornadas pela API', async () => {
    renderPage();
    await waitForCards();
    expect(screen.getAllByText('UPA Vila Pereira').length).toBeGreaterThan(0);
    expect(screen.getByText('UPA Centro')).toBeInTheDocument();
  });

  it('exibe os totais do resumo global', async () => {
    renderPage();
    await waitForCards();
    const resumo = document.querySelector('.tr-resumo-global') as HTMLElement;
    expect(resumo).toHaveTextContent('1'); // presentes
    expect(resumo).toHaveTextContent('50%'); // sla geral
  });

  it('exibe badge de status crítico para UPA com ausência', async () => {
    renderPage();
    await waitFor(() => screen.getByText('UPA Centro'));
    expect(screen.getByText('Atenção crítica')).toBeInTheDocument();
  });

  it('exibe badge Normal para UPA sem problemas', async () => {
    renderPage();
    await waitForCards();
    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  it('exibe chip do médico com status presente', async () => {
    renderPage();
    await waitForCards();
    // Chip mostra as duas primeiras palavras do nome: "Dra. Jessica"
    const chip = document.querySelector('.tr-med-chip.presente');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('Dra. Jessica');
  });

  it('exibe vagas abertas quando openSlots > 0', async () => {
    renderPage();
    await waitFor(() => screen.getByText('UPA Centro'));
    expect(screen.getByText('1 vaga aberta')).toBeInTheDocument();
  });

  it('exibe tabs de contrato agrupando UPAs pelo mesmo contrato', async () => {
    renderPage();
    await waitForCards();
    expect(document.querySelector('.tr-contrato-tab-nome')).toBeInTheDocument();
    expect(screen.getByText('Todas as UPAs')).toBeInTheDocument();
  });

  it('filtra UPAs ao clicar em um tab de contrato', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitForCards();
    // Como só há um contrato no fixture, clicar nele mantém ambas as UPAs visíveis
    const tab = document.querySelector('.tr-contrato-tab:not(:first-child)') as HTMLElement;
    await user.click(tab);
    expect(screen.getAllByText('UPA Vila Pereira').length).toBeGreaterThan(0);
    expect(screen.getByText('UPA Centro')).toBeInTheDocument();
  });

  it('exibe feed de eventos recentes', async () => {
    renderPage();
    await waitForCards();
    // A mesma descrição aparece no card (lastEventDescription) e no feed —
    // verificamos especificamente dentro do feed de eventos.
    const feed = document.querySelector('.tr-eventos-list') as HTMLElement;
    expect(feed).toHaveTextContent('Dra. Jessica Lima check-in 10:02');
  });

  it('exibe mensagem quando não há eventos', async () => {
    (attendanceApi.getLiveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockResponse,
      recentEvents: [],
    });
    renderPage();
    await waitFor(() => screen.getByText('Nenhum evento registrado ainda hoje.'));
  });

  it('exibe mensagem quando não há UPAs com plantão hoje', async () => {
    (attendanceApi.getLiveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      clinics: [],
      recentEvents: [],
      totalPresent: 0,
      totalLate: 0,
      totalAbsent: 0,
      totalOpenSlots: 0,
      overallSlaPercent: 100,
    });
    renderPage();
    await waitFor(() => screen.getByText('Nenhuma UPA com plantões hoje.'));
  });

  it('chama getLiveStatus novamente ao clicar em Atualizar', async () => {
    renderPage();
    const user = userEvent.setup();
    await waitForCards();
    expect(attendanceApi.getLiveStatus).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText('Atualizar'));

    await waitFor(() => {
      expect(attendanceApi.getLiveStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('lida com erro da API graciosamente (não trava a tela)', async () => {
    (attendanceApi.getLiveStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderPage();
    await waitFor(() => {
      expect(screen.queryByText('Carregando painel…')).not.toBeInTheDocument();
    });
  });

  it('exibe botão de Alerta apenas em UPAs com status crítico/atenção', async () => {
    renderPage();
    await waitFor(() => screen.getByText('UPA Centro'));
    const cards = document.querySelectorAll('.tr-upa-card');
    expect(cards).toHaveLength(2);
    // O card crítico (Centro) deve ter o botão de alerta
    const centroCard = Array.from(cards).find(c => c.textContent?.includes('UPA Centro'));
    expect(centroCard?.querySelector('.tr-btn-upa.alerta')).toBeInTheDocument();
    // O card ok (Vila Pereira) não deve ter
    const okCard = Array.from(cards).find(c => c.textContent?.includes('UPA Vila Pereira'));
    expect(okCard?.querySelector('.tr-btn-upa.alerta')).not.toBeInTheDocument();
  });

  it('chama onToggleTheme ao clicar no botão de tema', async () => {
    const onToggle = vi.fn();
    render(
      <div id="adm-root">
        <AdminTempoReal onBack={vi.fn()} dark={false} onToggleTheme={onToggle} />
      </div>
    );
    const user = userEvent.setup();
    await waitForCards();
    const themeBtn = document.querySelector('.theme-toggle') as HTMLElement;
    await user.click(themeBtn);
    expect(onToggle).toHaveBeenCalled();
  });

  it('chama onOpenSidebar ao clicar no hamburger', async () => {
    const onOpenSidebar = vi.fn();
    render(
      <div id="adm-root">
        <AdminTempoReal onBack={vi.fn()} dark={false} onToggleTheme={vi.fn()} onOpenSidebar={onOpenSidebar} />
      </div>
    );
    const user = userEvent.setup();
    await waitForCards();
    // O botão hamburger tem display:none por padrão (só aparece via media query
    // mobile), que o jsdom não avalia — CSS real ainda o torna "inacessível" a
    // getByRole, então usamos querySelector para localizá-lo diretamente.
    const hamburger = document.querySelector('.tr-hamburger') as HTMLElement;
    await user.click(hamburger);
    expect(onOpenSidebar).toHaveBeenCalled();
  });
});
