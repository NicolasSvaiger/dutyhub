/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefeituraEscalas } from '../PrefeituraEscalas';

vi.mock('../../../api/prefeituraApi', () => ({
  prefeituraApi: {
    getClinics: vi.fn(),
    getWeeklySchedule: vi.fn(),
  },
}));

import { prefeituraApi } from '../../../api/prefeituraApi';

const mockClinics = [
  { clinicId: 'c1', name: 'UPA Centro', address: null, contractNumber: null },
  { clinicId: 'c2', name: 'UPA Norte', address: null, contractNumber: null },
];

function makeDays(startIso: string): string[] {
  const start = new Date(startIso);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString();
  });
}

const days = makeDays('2026-07-12T00:00:00Z'); // domingo

const mockSchedule = {
  clinicId: 'c1',
  clinicName: 'UPA Centro',
  doctorsPerShiftTarget: 3,
  weekStart: days[0],
  weekEnd: days[6],
  days,
  totalShiftSlots: 2,
  totalConfirmed: 1,
  totalPending: 1,
  totalUncovered: 1,
  totalDoctors: 2,
  rows: [
    {
      turno: 'manha',
      startTime: '07:00:00',
      endTime: '19:00:00',
      cells: days.map((d, i) => ({
        date: d,
        assignments:
          i === 2
            ? [
                { userId: 'u1', userName: 'Dra. Ana Silva', professionalType: 'Medico', status: 'confirmado' },
                { userId: 'u2', userName: 'Enf. Bruno Costa', professionalType: 'Enfermeiro', status: 'pendente' },
              ]
            : [],
        uncoveredCount: i === 2 ? 1 : 0,
      })),
    },
  ],
};

describe('<PrefeituraEscalas />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prefeituraApi.getClinics as ReturnType<typeof vi.fn>).mockResolvedValue(mockClinics);
    (prefeituraApi.getWeeklySchedule as ReturnType<typeof vi.fn>).mockResolvedValue(mockSchedule);
  });

  it('chama getClinics no mount e getWeeklySchedule com a primeira UPA', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(prefeituraApi.getClinics).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(prefeituraApi.getWeeklySchedule).toHaveBeenCalledTimes(1));
    const args = (prefeituraApi.getWeeklySchedule as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe('c1');
  });

  it('renderiza o seletor de UPA com as clínicas do escopo', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(screen.getByText('UPA Centro')).toBeInTheDocument());
    expect(screen.getByText('UPA Norte')).toBeInTheDocument();
  });

  it('clicar em outra UPA dispara nova fetch com o novo clinicId', async () => {
    render(<PrefeituraEscalas />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getWeeklySchedule).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText('UPA Norte'));

    await waitFor(() => expect(prefeituraApi.getWeeklySchedule).toHaveBeenCalledTimes(2));
    const lastArgs = (prefeituraApi.getWeeklySchedule as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(lastArgs[0]).toBe('c2');
  });

  it('renderiza os 5 KPIs da semana', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(screen.getByText(/Turnos na semana/i)).toBeInTheDocument());
    expect(screen.getByText(/Confirmados/i)).toBeInTheDocument();
    expect(screen.getByText(/Pendentes/i)).toBeInTheDocument();
    expect(screen.getByText(/Profissionais escalados/i)).toBeInTheDocument();
  });

  it('renderiza a grade com nomes dos médicos escalados', async () => {
    render(<PrefeituraEscalas />);
    // O componente exibe só as 2 primeiras palavras (ex: "Dra. Ana") pra
    // caber no chip — nome completo fica no atributo title.
    await waitFor(() => expect(screen.getByText('Dra. Ana')).toBeInTheDocument());
    expect(screen.getByText('Enf. Bruno')).toBeInTheDocument();
  });

  it('renderiza badge de tipo profissional no chip da grade', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(screen.getByText('Dra. Ana')).toBeInTheDocument());
    expect(screen.getByText('Médico')).toBeInTheDocument();
    expect(screen.getByText('Enfermeiro(a)')).toBeInTheDocument();
  });

  it('exibe "Vaga em aberto" quando há uncoveredCount > 0', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(screen.getByText(/Vaga em aberto/i)).toBeInTheDocument());
  });

  it('exibe alerta de "sem cobertura" quando totalUncovered > 0', async () => {
    render(<PrefeituraEscalas />);
    await waitFor(() => {
      expect(screen.getByText(/vaga sem cobertura na semana/i)).toBeInTheDocument();
    });
  });

  it('exibe alerta de confirmação positivo quando não há pendências nem vagas', async () => {
    (prefeituraApi.getWeeklySchedule as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockSchedule,
      totalUncovered: 0,
      totalPending: 0,
      rows: [{ ...mockSchedule.rows[0], cells: mockSchedule.rows[0].cells.map((c) => ({ ...c, uncoveredCount: 0 })) }],
    });
    render(<PrefeituraEscalas />);
    await waitFor(() => {
      expect(screen.getByText(/cobertura confirmada para esta semana/i)).toBeInTheDocument();
    });
  });

  it('navegar pra próxima semana dispara nova fetch', async () => {
    render(<PrefeituraEscalas />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getWeeklySchedule).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /Próxima semana/i }));

    await waitFor(() => expect(prefeituraApi.getWeeklySchedule).toHaveBeenCalledTimes(2));
  });

  it('botão "Hoje" volta pro offset 0', async () => {
    render(<PrefeituraEscalas />);
    const user = userEvent.setup();
    await waitFor(() => expect(prefeituraApi.getWeeklySchedule).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /Próxima semana/i }));
    await waitFor(() => expect(prefeituraApi.getWeeklySchedule).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: /^Hoje$/i }));
    await waitFor(() => expect(prefeituraApi.getWeeklySchedule).toHaveBeenCalledTimes(3));
  });

  it('empty state quando não há UPAs no escopo', async () => {
    (prefeituraApi.getClinics as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(screen.getByText(/Selecione uma UPA/i)).toBeInTheDocument());
  });

  it('mostra erro NO_ORGAN_CONTEXT específico quando backend responde 403', async () => {
    (prefeituraApi.getWeeklySchedule as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('NO_ORGAN_CONTEXT'),
    );
    render(<PrefeituraEscalas />);
    await waitFor(() => expect(screen.getByText(/não está vinculada a um órgão/i)).toBeInTheDocument());
  });
});
