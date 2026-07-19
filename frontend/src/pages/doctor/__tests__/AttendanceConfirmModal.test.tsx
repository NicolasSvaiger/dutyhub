import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { AttendanceConfirmModal } from '../AttendanceConfirmModal';
import { renderWithProviders, makeTestClinic } from '../../../test-utils/renderWithProviders';
import type { AttendanceStatusResponse } from '../../../api/attendanceApi';

vi.mock('../../../api/notificationsApi', () => ({
  notificationsApi: {
    getUnreadCount: () => Promise.resolve(0),
    getAll: () => Promise.resolve([]),
  },
}));

const getStatusMock = vi.fn<() => Promise<AttendanceStatusResponse>>();
vi.mock('../../../api/attendanceApi', () => ({
  attendanceApi: {
    getStatus: (...args: unknown[]) => getStatusMock(...(args as [])),
    getActive: vi.fn().mockResolvedValue([]),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    getMyHistory: vi.fn().mockResolvedValue([]),
    syncOfflineEvents: vi.fn(),
  },
}));

/** Builds a default "can check-in" status. */
function canCheckInStatus(shifts: AttendanceStatusResponse['availableShiftsToday'] = []): AttendanceStatusResponse {
  return {
    hasActiveCheckIn: false,
    canCheckIn: shifts.length > 0,
    canCheckOut: false,
    activeAttendance: null,
    availableShiftsToday: shifts,
  };
}

/** Builds a "blocked" status (has active check-in). */
function blockedStatus(): AttendanceStatusResponse {
  return {
    hasActiveCheckIn: true,
    canCheckIn: false,
    canCheckOut: true,
    activeAttendance: {
      id: 'att-1',
      shiftId: 's-1',
      clinicId: 'c-1',
      clinicName: 'Clínica Alpha',
      checkInTime: '2025-06-15T08:00:00Z',
    },
    availableShiftsToday: [],
  };
}

describe('<AttendanceConfirmModal />', () => {
  beforeEach(() => {
    getStatusMock.mockReset();
    // Clear offline cache between tests to avoid cross-test contamination
    localStorage.clear();
  });

  describe('modo check-in', () => {
    it('mostra título e subtítulo de check-in', async () => {
      getStatusMock.mockResolvedValue(canCheckInStatus());

      renderWithProviders(
        <AttendanceConfirmModal
          mode="checkin"
          onClose={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(
        await screen.findByText(i18n.t('doctor.modal.title.checkin')),
      ).toBeInTheDocument();
      expect(
        screen.getByText(i18n.t('doctor.modal.subtitle.checkin')),
      ).toBeInTheDocument();
    });

    it('mostra estado vazio quando backend diz canCheckIn=false e sem bloqueio', async () => {
      getStatusMock.mockResolvedValue(canCheckInStatus([])); // sem shifts, sem bloqueio

      renderWithProviders(
        <AttendanceConfirmModal
          mode="checkin"
          onClose={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(
        await screen.findByText(i18n.t('doctor.modal.empty.checkin')),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: i18n.t('doctor.modal.confirm') }),
      ).not.toBeInTheDocument();
    });

    it('mostra plantão único quando backend retorna um shift', async () => {
      getStatusMock.mockResolvedValue(canCheckInStatus([
        { shiftId: 's-1', clinicId: 'c-1', title: 'Plantão UTI', startTime: '08:00:00', endTime: '20:00:00' },
      ]));

      renderWithProviders(
        <AttendanceConfirmModal
          mode="checkin"
          onClose={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(await screen.findByText('Plantão UTI')).toBeInTheDocument();
      expect(screen.getByText(/08h00.*20h00/)).toBeInTheDocument();
    });

    it('confirmar chama onConfirm com shiftId', async () => {
      getStatusMock.mockResolvedValue(canCheckInStatus([
        { shiftId: 'shift-42', clinicId: 'c-1', title: 'Plantão', startTime: '08:00:00', endTime: '20:00:00' },
      ]));
      const onConfirm = vi.fn().mockResolvedValue(undefined);

      renderWithProviders(
        <AttendanceConfirmModal mode="checkin" onClose={vi.fn()} onConfirm={onConfirm} />,
      );
      const user = userEvent.setup();

      const confirmButton = await screen.findByRole('button', { name: i18n.t('doctor.modal.confirm') });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith('shift-42');
      });
    });

    it('cancelar chama onClose', async () => {
      getStatusMock.mockResolvedValue(canCheckInStatus([
        { shiftId: 's-1', clinicId: 'c-1', title: 'Plantão', startTime: '08:00:00', endTime: '20:00:00' },
      ]));
      const onClose = vi.fn();

      renderWithProviders(
        <AttendanceConfirmModal mode="checkin" onClose={onClose} onConfirm={vi.fn().mockResolvedValue(undefined)} />,
      );
      const user = userEvent.setup();

      await screen.findByText('Plantão');
      await user.click(screen.getByRole('button', { name: i18n.t('doctor.modal.no') }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('bloqueia quando backend diz hasActiveCheckIn=true', async () => {
      getStatusMock.mockResolvedValue(blockedStatus());

      renderWithProviders(
        <AttendanceConfirmModal
          mode="checkin"
          onClose={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
        { clinics: [makeTestClinic({ id: 'c-1', name: 'Clínica Alpha' })] },
      );

      expect(
        await screen.findByText(i18n.t('doctor.modal.blocked.title')),
      ).toBeInTheDocument();
      expect(
        screen.getByText(i18n.t('doctor.modal.blocked.hint')),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: i18n.t('doctor.modal.confirm') }),
      ).not.toBeInTheDocument();
    });
  });

  describe('modo check-out', () => {
    it('mostra título de check-out', async () => {
      getStatusMock.mockResolvedValue({
        hasActiveCheckIn: false,
        canCheckIn: false,
        canCheckOut: false,
        activeAttendance: null,
        availableShiftsToday: [],
      });

      renderWithProviders(
        <AttendanceConfirmModal
          mode="checkout"
          onClose={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(
        await screen.findByText(i18n.t('doctor.modal.title.checkout')),
      ).toBeInTheDocument();
    });

    it('mostra info do check-in ativo quando canCheckOut=true', async () => {
      getStatusMock.mockResolvedValue(blockedStatus()); // hasActive + canCheckOut

      renderWithProviders(
        <AttendanceConfirmModal
          mode="checkout"
          onClose={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
        { clinics: [makeTestClinic({ id: 'c-1', name: 'Clínica Alpha' })] },
      );

      expect(await screen.findByText('Clínica Alpha')).toBeInTheDocument();
    });

    it('mostra vazio quando não há check-in ativo (canCheckOut=false)', async () => {
      getStatusMock.mockResolvedValue({
        hasActiveCheckIn: false,
        canCheckIn: false,
        canCheckOut: false,
        activeAttendance: null,
        availableShiftsToday: [],
      });

      renderWithProviders(
        <AttendanceConfirmModal
          mode="checkout"
          onClose={vi.fn()}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(
        await screen.findByText(i18n.t('doctor.modal.empty.checkout')),
      ).toBeInTheDocument();
    });
  });
});
