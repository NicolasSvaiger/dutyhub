/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PrefeituraTvMode } from '../PrefeituraTvMode';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getRealtime: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockRealtime = {
  asOf: '2026-07-17T14:30:00Z',
  totalClinics: 3,
  totalExpectedNow: 20,
  totalPresentNow: 17,
  totalAbsentNow: 3,
  totalLateNow: 1,
  clinics: [
    {
      clinicId: 'c1',
      name: 'UPA Alpha',
      expectedCount: 8,
      presentCount: 8,
      absentCount: 0,
      lateCount: 0,
      alertLevel: 'green',
      absentUserNames: [],
      turnoCode: 'manha',
      shiftStartTime: '07:00:00',
      shiftEndTime: '19:00:00',
      doctors: [
        { userId: 'u1', userName: 'Dra. Jessica Lima', registrationNumber: '1111-SP', professionalType: 'Medico', status: 'present', checkInTime: '2026-07-17T07:02:00Z', expectedTime: '2026-07-17T07:00:00Z' },
      ],
      lastEventUserName: 'Dra. Jessica Lima',
      lastEventType: 'checkin',
      lastEventTime: '2026-07-17T07:02:00Z',
    },
    {
      clinicId: 'c2',
      name: 'UPA Beta',
      expectedCount: 6,
      presentCount: 5,
      absentCount: 0,
      lateCount: 1,
      alertLevel: 'yellow',
      absentUserNames: [],
      turnoCode: 'manha',
      shiftStartTime: '07:00:00',
      shiftEndTime: '19:00:00',
      doctors: [
        { userId: 'u2', userName: 'Enf. Mariana Costa', registrationNumber: '2222-SP', professionalType: 'Enfermeiro', status: 'late', checkInTime: '2026-07-17T07:45:00Z', expectedTime: '2026-07-17T07:00:00Z' },
      ],
      lastEventUserName: 'Enf. Mariana Costa',
      lastEventType: 'checkin',
      lastEventTime: '2026-07-17T07:45:00Z',
    },
    {
      clinicId: 'c3',
      name: 'UPA Gama',
      expectedCount: 6,
      presentCount: 4,
      absentCount: 2,
      lateCount: 0,
      alertLevel: 'red',
      absentUserNames: ['Dr. Beto', 'Dra. Carla'],
      turnoCode: 'manha',
      shiftStartTime: '07:00:00',
      shiftEndTime: '19:00:00',
      doctors: [
        { userId: 'u3', userName: 'Dr. Diego Faria', registrationNumber: '3333-SP', status: 'present', checkInTime: '2026-07-17T07:01:00Z', expectedTime: '2026-07-17T07:00:00Z' },
      ],
      lastEventUserName: 'Dr. Beto',
      lastEventType: 'absence',
      lastEventTime: '2026-07-17T08:00:00Z',
    },
  ],
  recentEvents: [],
};

function renderTv() {
  return render(
    <MemoryRouter>
      <PrefeituraTvMode />
    </MemoryRouter>,
  );
}

describe('<PrefeituraTvMode />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    vi.useFakeTimers();
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockResolvedValue(mockRealtime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chama getRealtime no mount', async () => {
    renderTv();
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));
  });

  it('renderiza brand + tagline', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('24p7')).toBeInTheDocument());
    expect(screen.getByText(/Monitoramento em tempo real/i)).toBeInTheDocument();
  });

  it('renderiza título e subtítulo do header', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText(/Painel de Monitoramento · Plantões/i)).toBeInTheDocument());
    expect(screen.getByText(/Secretaria Municipal de Saúde/i)).toBeInTheDocument();
  });

  it('renderiza relógio wall-clock', async () => {
    renderTv();
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalled());
    const clockRegex = /\d{2}:\d{2}/;
    const matches = screen.getAllByText(clockRegex);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renderiza clínicas com nomes e semáforo por alertLevel', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('UPA Alpha')).toBeInTheDocument());
    expect(screen.getByText('UPA Beta')).toBeInTheDocument();
    expect(screen.getByText('UPA Gama')).toBeInTheDocument();

    const cards = document.querySelectorAll('[class*="upaCard_"]');
    expect(cards.length).toBe(3);
    const classNames = Array.from(cards).map((c) => c.className).join(' ');
    expect(classNames).toMatch(/green/);
    expect(classNames).toMatch(/yellow/);
    expect(classNames).toMatch(/red/);
  });

  it('renderiza contador grande de presentes/escalados por UPA', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('UPA Alpha')).toBeInTheDocument());
    // UPA Beta e Gama ambas têm "/ 6" (escalados) — usar getAllByText.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByText('/ 6').length).toBe(2);
  });

  it('renderiza dots de médicos por UPA', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument());
    expect(screen.getByText('Enf. Mariana Costa')).toBeInTheDocument();
    expect(screen.getByText('Dr. Diego Faria')).toBeInTheDocument();
  });

  it('renderiza badge de tipo profissional nos dots de médicos', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('Dra. Jessica Lima')).toBeInTheDocument());
    expect(screen.getByText('Médico')).toBeInTheDocument();
    expect(screen.getByText('Enfermeiro(a)')).toBeInTheDocument();
  });

  it('renderiza alerta crítico quando há ausência e alerta positivo quando tudo confirmado', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText(/vaga\(s\) sem cobertura/i)).toBeInTheDocument());
    expect(screen.getByText(/Todos os profissionais confirmados/i)).toBeInTheDocument();
  });

  it('renderiza os stats do footer (presentes/escalados/atrasos/ausências)', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('17')).toBeInTheDocument());
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renderiza o anel de ocupação global com percentual', async () => {
    renderTv();
    // 17/20 = 85%
    await vi.waitFor(() => expect(screen.getByText('85%')).toBeInTheDocument());
    expect(screen.getByText(/Taxa de Ocupação Global/i)).toBeInTheDocument();
  });

  it('renderiza countdown de próxima atualização e decrementa', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('20s')).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(screen.getByText('19s')).toBeInTheDocument());
  });

  it('renderiza badge "AO VIVO"', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('AO VIVO')).toBeInTheDocument());
  });

  it('polling refetch a cada 20s (mais agressivo que Realtime)', async () => {
    renderTv();
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(3));
  });

  it('unmount para o polling e o clock tick', async () => {
    const { unmount } = renderTv();
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));

    unmount();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1);
  });

  it('clicar em "Sair do Modo TV" navega pra /prefeitura com replace', async () => {
    renderTv();
    await vi.waitFor(() => expect(screen.getByText('UPA Alpha')).toBeInTheDocument());

    // useFakeTimers pode fazer userEvent travar; usar real timers pra este teste
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Sair do Modo TV/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/prefeitura', { replace: true });
  });

  it('mostra error quando getRealtime falha', async () => {
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
    renderTv();
    await vi.waitFor(() => expect(screen.getByText(/Não foi possível carregar/i)).toBeInTheDocument());
  });
});
