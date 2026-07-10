import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { DoctorShiftsScreen } from '../DoctorShiftsScreen';
import { renderWithProviders, makeTestClinic } from '../../../test-utils/renderWithProviders';
import type { Shift } from '../../../types';

// Mock APIs de rede que o header e o próprio screen carregam
vi.mock('../../../api/notificationsApi', () => ({
  notificationsApi: {
    getUnreadCount: () => Promise.resolve(0),
    getAll: () => Promise.resolve([]),
  },
}));

const getMineMock = vi.fn<() => Promise<Shift[]>>();
vi.mock('../../../api/shiftsApi', () => ({
  shiftsApi: {
    getMine: (...args: unknown[]) => getMineMock(...(args as [])),
    // Métodos extras do módulo — não usados nesta tela mas precisam existir
    // porque o TS pode reclamar se alguém importar de outro lugar.
    getMyToday: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
  },
}));

function makeShift(overrides: Partial<Shift> & { id: string; date: string }): Shift {
  return {
    clinicId: 'c-1',
    title: 'Plantão UTI',
    startTime: '08:00:00',
    endTime: '20:00:00',
    createdAt: '2024-01-01T00:00:00Z',
    assignments: [],
    ...overrides,
  };
}

/** YYYY-MM-DD para hoje no fuso local, batendo com groupShifts. */
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD para hoje + `days` dias (positivo = futuro, negativo = passado). */
function shiftedIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('<DoctorShiftsScreen />', () => {
  beforeEach(() => {
    getMineMock.mockReset();
  });

  it('mostra loading enquanto busca e depois some', async () => {
    let resolveFn: (v: Shift[]) => void = () => {};
    getMineMock.mockReturnValue(new Promise<Shift[]>((r) => { resolveFn = r; }));

    renderWithProviders(<DoctorShiftsScreen />);

    const loading = screen.getByText(i18n.t('doctor.shifts.loading'));
    expect(loading).toBeInTheDocument();

    resolveFn([]);
    await waitForElementToBeRemoved(loading);
  });

  it('mostra mensagem de vazio quando não há plantões', async () => {
    getMineMock.mockResolvedValue([]);

    renderWithProviders(<DoctorShiftsScreen />);

    expect(
      await screen.findByText(i18n.t('doctor.shifts.empty')),
    ).toBeInTheDocument();
  });

  it('agrupa plantões em hoje / próximos / passados', async () => {
    getMineMock.mockResolvedValue([
      makeShift({ id: 'past-1', date: shiftedIso(-3), title: 'Turno Antigo' }),
      makeShift({ id: 'today-1', date: todayIso(), title: 'Turno Atual' }),
      makeShift({ id: 'up-1', date: shiftedIso(2), title: 'Turno Futuro' }),
    ]);

    renderWithProviders(<DoctorShiftsScreen />);

    // Espera plantões renderizarem
    expect(await screen.findByText('Turno Atual')).toBeInTheDocument();
    expect(screen.getByText('Turno Futuro')).toBeInTheDocument();
    expect(screen.getByText('Turno Antigo')).toBeInTheDocument();

    // Cabeçalhos dos grupos aparecem
    expect(screen.getByText(i18n.t('doctor.shifts.today'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('doctor.shifts.upcoming'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('doctor.shifts.past'))).toBeInTheDocument();
  });

  it('colapsa passados quando há mais de 5, e "Ver mais" expande', async () => {
    // 7 passados + 1 hoje pra garantir a lista renderizar
    const past = Array.from({ length: 7 }, (_, i) =>
      makeShift({
        id: `past-${i}`,
        date: shiftedIso(-(i + 1)),
        title: `Passado ${i}`,
      }),
    );
    getMineMock.mockResolvedValue([
      ...past,
      makeShift({ id: 'today', date: todayIso(), title: 'Turno Atual' }),
    ]);

    renderWithProviders(<DoctorShiftsScreen />);
    const user = userEvent.setup();

    await screen.findByText('Turno Atual');

    // Só 5 passados visíveis
    expect(screen.getByText('Passado 0')).toBeInTheDocument();
    expect(screen.getByText('Passado 4')).toBeInTheDocument();
    expect(screen.queryByText('Passado 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Passado 6')).not.toBeInTheDocument();

    // Botão "Ver mais (2)"
    const showMore = screen.getByRole('button', {
      name: i18n.t('doctor.shifts.showMore', { count: 2 }),
    });
    await user.click(showMore);

    // Agora todos aparecem
    expect(screen.getByText('Passado 5')).toBeInTheDocument();
    expect(screen.getByText('Passado 6')).toBeInTheDocument();

    // Botão vira "Ver menos"
    expect(
      screen.getByRole('button', { name: i18n.t('doctor.shifts.showLess') }),
    ).toBeInTheDocument();
  });

  it('colapsa próximos quando há mais de 5, com "Ver mais" independente do passados', async () => {
    // 7 futuros — devem colapsar em 5 também
    const upcoming = Array.from({ length: 7 }, (_, i) =>
      makeShift({
        id: `up-${i}`,
        date: shiftedIso(i + 1),
        title: `Futuro ${i}`,
      }),
    );
    getMineMock.mockResolvedValue(upcoming);

    renderWithProviders(<DoctorShiftsScreen />);
    const user = userEvent.setup();

    // Os 5 primeiros aparecem, os últimos 2 ficam escondidos
    expect(await screen.findByText('Futuro 0')).toBeInTheDocument();
    expect(screen.getByText('Futuro 4')).toBeInTheDocument();
    expect(screen.queryByText('Futuro 5')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: i18n.t('doctor.shifts.showMore', { count: 2 }) }),
    );
    expect(screen.getByText('Futuro 5')).toBeInTheDocument();
    expect(screen.getByText('Futuro 6')).toBeInTheDocument();
  });

  it('mostra erro quando a API falha', async () => {
    getMineMock.mockRejectedValue(new Error('boom'));

    renderWithProviders(<DoctorShiftsScreen />);

    const err = await screen.findByRole('alert');
    expect(err).toHaveTextContent(i18n.t('doctor.shifts.errorLoading'));
  });

  it('resolve nome da clínica via ClinicContext', async () => {
    const alpha = makeTestClinic({ id: 'c-1', name: 'Clínica Alpha' });
    const beta = makeTestClinic({ id: 'c-2', name: 'Clínica Beta' });
    getMineMock.mockResolvedValue([
      makeShift({ id: 's1', date: shiftedIso(1), clinicId: 'c-2' }),
    ]);

    renderWithProviders(<DoctorShiftsScreen />, {
      clinics: [alpha, beta],
      activeClinic: alpha,
    });

    // Espera renderizar
    await screen.findByText('Plantão UTI');

    // O item exibe o nome da clínica correta (Beta), não a ativa (Alpha)
    expect(screen.getByText('Clínica Beta')).toBeInTheDocument();
  });
});
