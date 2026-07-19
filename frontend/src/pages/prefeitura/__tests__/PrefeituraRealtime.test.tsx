/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PrefeituraRealtime } from '../PrefeituraRealtime';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getRealtime: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockRealtime = {
  asOf: '2026-07-17T14:30:00Z',
  totalClinics: 3,
  totalExpectedNow: 15,
  totalPresentNow: 12,
  totalAbsentNow: 3,
  totalLateNow: 1,
  clinics: [
    {
      clinicId: 'c1',
      name: 'UPA Centro',
      expectedCount: 5,
      presentCount: 5,
      absentCount: 0,
      lateCount: 0,
      alertLevel: 'green',
      absentUserNames: [],
      turnoCode: 'manha',
      shiftStartTime: '07:00:00',
      shiftEndTime: '19:00:00',
      doctors: [
        { userId: 'u1', userName: 'Dra. Ana Silva', registrationNumber: '1234-SP', professionalType: 'Medico', status: 'present', checkInTime: '2026-07-17T07:02:00Z', expectedTime: '2026-07-17T07:00:00Z' },
      ],
      lastEventUserName: 'Dra. Ana Silva',
      lastEventType: 'checkin',
      lastEventTime: '2026-07-17T07:02:00Z',
    },
    {
      clinicId: 'c2',
      name: 'UPA Norte',
      expectedCount: 6,
      presentCount: 4,
      absentCount: 2,
      lateCount: 1,
      alertLevel: 'yellow',
      absentUserNames: ['Dra. Ana', 'Dr. Bruno'],
      turnoCode: 'manha',
      shiftStartTime: '07:00:00',
      shiftEndTime: '19:00:00',
      doctors: [
        { userId: 'u2', userName: 'Enf. Bruno Costa', registrationNumber: '5678-SP', professionalType: 'Enfermeiro', status: 'late', checkInTime: '2026-07-17T07:20:00Z', expectedTime: '2026-07-17T07:00:00Z' },
        { userId: 'u3', userName: 'Dra. Carla Dias', registrationNumber: null, professionalType: 'Medico', status: 'absent', checkInTime: null, expectedTime: '2026-07-17T07:00:00Z' },
      ],
      lastEventUserName: 'Dra. Carla Dias',
      lastEventType: 'absence',
      lastEventTime: '2026-07-17T08:00:00Z',
    },
    {
      clinicId: 'c3',
      name: 'UPA Sul',
      expectedCount: 4,
      presentCount: 3,
      absentCount: 1,
      lateCount: 0,
      alertLevel: 'red',
      absentUserNames: ['Dra. Carla'],
      turnoCode: null,
      shiftStartTime: null,
      shiftEndTime: null,
      doctors: [],
      lastEventUserName: null,
      lastEventType: null,
      lastEventTime: null,
    },
  ],
  recentEvents: [
    { timestamp: '2026-07-17T08:00:00Z', type: 'absence', userId: 'u3', userName: 'Dra. Carla Dias', clinicName: 'UPA Norte', minutesLate: null },
    { timestamp: '2026-07-17T07:20:00Z', type: 'late', userId: 'u2', userName: 'Enf. Bruno Costa', clinicName: 'UPA Norte', minutesLate: 20 },
    { timestamp: '2026-07-17T07:02:00Z', type: 'checkin', userId: 'u1', userName: 'Dra. Ana Silva', clinicName: 'UPA Centro', minutesLate: null },
  ],
};

describe('<PrefeituraRealtime />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockResolvedValue(mockRealtime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chama getRealtime no mount', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));
  });

  it('renderiza os 4 KPIs no topo', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText(/Total de UPAs/i)).toBeInTheDocument());
    // "Profissionais presentes" aparece 2x: label do KPI + label da barra de
    // progresso de cada UPA — usar getAllByText.
    expect(screen.getAllByText(/Profissionais presentes/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/^Atrasos$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Ausências$/i)).toBeInTheDocument();
  });

  it('renderiza clínicas com nomes', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText('UPA Centro')).toBeInTheDocument());
    expect(screen.getByText('UPA Norte')).toBeInTheDocument();
    expect(screen.getByText('UPA Sul')).toBeInTheDocument();
  });

  it('renderiza a lista de médicos com status granular por UPA', async () => {
    render(<PrefeituraRealtime />);
    // Nomes aparecem tanto no card da UPA quanto no feed de eventos —
    // usar getAllByText.
    await vi.waitFor(() => expect(screen.getAllByText('Dra. Ana Silva').length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText('Enf. Bruno Costa').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Dra. Carla Dias').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Presente')).toBeInTheDocument();
    expect(screen.getByText('Atrasado')).toBeInTheDocument();
    expect(screen.getByText('Ausente')).toBeInTheDocument();
  });

  it('renderiza badge de tipo profissional junto ao nome de cada médico', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getAllByText('Dra. Ana Silva').length).toBeGreaterThanOrEqual(1));
    expect(screen.getAllByText('Médico').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Enfermeiro(a)').length).toBeGreaterThanOrEqual(1);
  });

  it('aplica classe green/yellow/red por alertLevel', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText('UPA Centro')).toBeInTheDocument());

    const cards = document.querySelectorAll('[class*="upaCard_"]');
    expect(cards.length).toBe(3);
    const classNames = Array.from(cards).map((c) => c.className);
    expect(classNames.some((cn) => cn.includes('green'))).toBe(true);
    expect(classNames.some((cn) => cn.includes('yellow'))).toBe(true);
    expect(classNames.some((cn) => cn.includes('red'))).toBe(true);
  });

  it('mostra "Sem turno em andamento" pra UPA sem médicos escalados agora', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText('UPA Sul')).toBeInTheDocument());
    expect(screen.getAllByText(/Sem turno em andamento/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renderiza o último evento por UPA', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => {
      expect(screen.getByText(/Dra\. Ana Silva realizou check-in/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Dra\. Carla Dias não realizou check-in/i)).toBeInTheDocument();
  });

  it('renderiza o feed de eventos recentes', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText(/Eventos Recentes/i)).toBeInTheDocument());
    expect(screen.getByText(/Atraso de 20min/i)).toBeInTheDocument();
    expect(screen.getByText(/Ausência registrada/i)).toBeInTheDocument();
    expect(screen.getByText(/Check-in realizado/i)).toBeInTheDocument();
  });

  it('mostra timestamp asOf formatado', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText(/Atualizado às/i)).toBeInTheDocument());
  });

  it('polling refetch a cada 30s (setInterval)', async () => {
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(3));
  });

  it('unmount para o polling', async () => {
    const { unmount } = render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1));

    unmount();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(prefeituraApi.getRealtime).toHaveBeenCalledTimes(1);
  });

  it('empty state pra clinics vazias', async () => {
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockRealtime,
      clinics: [],
    });
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText(/Nenhuma UPA em operação/i)).toBeInTheDocument());
  });

  it('empty state pro feed de eventos quando recentEvents vazio', async () => {
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockRealtime,
      recentEvents: [],
    });
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText(/Nenhum evento registrado/i)).toBeInTheDocument());
  });

  it('error state quando fetch falha', async () => {
    (prefeituraApi.getRealtime as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NO_ORGAN_CONTEXT'));
    render(<PrefeituraRealtime />);
    await vi.waitFor(() => expect(screen.getByText(/não está vinculada a um órgão/i)).toBeInTheDocument());
  });
});
