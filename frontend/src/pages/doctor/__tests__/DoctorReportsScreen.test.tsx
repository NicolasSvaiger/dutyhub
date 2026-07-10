import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { DoctorReportsScreen } from '../DoctorReportsScreen';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import type { Attendance } from '../../../types';

vi.mock('../../../api/notificationsApi', () => ({
  notificationsApi: {
    getUnreadCount: () => Promise.resolve(0),
    getAll: () => Promise.resolve([]),
  },
}));

const getHistoryMock = vi.fn<() => Promise<Attendance[]>>();
vi.mock('../../../api/attendanceApi', () => ({
  attendanceApi: {
    getMyHistory: (...args: unknown[]) => getHistoryMock(...(args as [])),
    getActive: vi.fn(),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    syncOfflineEvents: vi.fn(),
  },
}));

function makeAttendance(overrides: Partial<Attendance> & { id: string }): Attendance {
  return {
    userId: 'u-1',
    shiftId: 's-1',
    clinicId: 'c-1',
    checkInTime: '2025-06-10T08:00:00Z',
    checkInLatitude: 0,
    checkInLongitude: 0,
    checkInDeviceId: 'dev-1',
    biometricValidated: true,
    ...overrides,
  };
}

describe('<DoctorReportsScreen />', () => {
  beforeEach(() => {
    getHistoryMock.mockReset();
  });

  it('mostra loading enquanto carrega e depois some', async () => {
    let resolveFn: (v: Attendance[]) => void = () => {};
    getHistoryMock.mockReturnValue(new Promise<Attendance[]>((r) => { resolveFn = r; }));

    renderWithProviders(<DoctorReportsScreen />);

    const loading = screen.getByText(i18n.t('doctor.reports.loading'));
    expect(loading).toBeInTheDocument();

    resolveFn([]);
    await waitForElementToBeRemoved(loading);
  });

  it('mostra "sem registros" quando histórico vem vazio', async () => {
    getHistoryMock.mockResolvedValue([]);

    renderWithProviders(<DoctorReportsScreen />);

    expect(
      await screen.findByText(i18n.t('doctor.reports.noRecords')),
    ).toBeInTheDocument();
  });

  it('renderiza cards de resumo, filtros e registros quando há dados', async () => {
    getHistoryMock.mockResolvedValue([
      makeAttendance({
        id: 'a1',
        checkInTime: '2025-06-10T08:00:00Z',
        checkOutTime: '2025-06-10T16:00:00Z',
      }),
      makeAttendance({
        id: 'a2',
        checkInTime: '2025-06-11T09:00:00Z',
        checkOutTime: '2025-06-11T15:00:00Z',
      }),
    ]);

    renderWithProviders(<DoctorReportsScreen />);

    expect(
      await screen.findByText(i18n.t('doctor.reports.summary')),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n.t('doctor.reports.filters'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('doctor.reports.records'))).toBeInTheDocument();

    // Dois registros com badge de "saída" (têm checkOut)
    const badges = screen.getAllByText(i18n.t('doctor.reports.badgeOut'));
    expect(badges).toHaveLength(2);
  });

  it('registro sem checkOut usa badge "em andamento"', async () => {
    getHistoryMock.mockResolvedValue([
      makeAttendance({ id: 'open', checkInTime: '2025-06-10T08:00:00Z' }),
    ]);

    renderWithProviders(<DoctorReportsScreen />);

    expect(
      await screen.findByText(i18n.t('doctor.reports.badgeIn')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t('doctor.reports.badgeOut')),
    ).not.toBeInTheDocument();
  });

  it('mostra alerta de erro com botão de retry quando fetch falha', async () => {
    getHistoryMock.mockRejectedValueOnce(new Error('boom'));

    renderWithProviders(<DoctorReportsScreen />);
    const user = userEvent.setup();

    const err = await screen.findByRole('alert');
    expect(err).toHaveTextContent(i18n.t('doctor.reports.errorLoading'));

    // Após o clique de retry, chamamos a API de novo (segunda vez com sucesso)
    getHistoryMock.mockResolvedValueOnce([]);
    await user.click(screen.getByRole('button', { name: i18n.t('doctor.reports.retry') }));

    expect(getHistoryMock).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByText(i18n.t('doctor.reports.noRecords')),
    ).toBeInTheDocument();
  });
});
