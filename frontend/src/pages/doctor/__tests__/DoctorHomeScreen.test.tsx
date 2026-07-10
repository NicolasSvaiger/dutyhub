import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { DoctorHomeScreen } from '../DoctorHomeScreen';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import type { OfflineAttendanceEvent } from '../../../types/offlineEvent';

// Header carrega notificações — mock
vi.mock('../../../api/notificationsApi', () => ({
  notificationsApi: {
    getUnreadCount: () => Promise.resolve(0),
    getAll: () => Promise.resolve([]),
  },
}));

// Geolocalização — controlado pelo teste
const getCurrentPositionMock = vi.fn().mockResolvedValue({ latitude: -23.5, longitude: -46.6 });
vi.mock('../../../hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    latitude: null,
    longitude: null,
    error: null,
    loading: false,
    getCurrentPosition: getCurrentPositionMock,
  }),
}));

// Offline sync — controlamos os eventos que aparecem no indicador
const offlineEvents: { events: OfflineAttendanceEvent[] } = { events: [] };
const enqueueOfflineEventMock = vi.fn();
vi.mock('../../../hooks/useOfflineSync', () => ({
  useOfflineSync: () => ({
    events: offlineEvents.events,
    isSyncing: false,
    lastSyncResults: null,
    lastSyncError: null,
    enqueueOfflineEvent: enqueueOfflineEventMock,
    syncPendingEvents: vi.fn(),
    refreshEvents: vi.fn(),
  }),
}));

// PendingOperationsIndicator usa useRetryQueue (fila separada). Mockamos
// pra que o `pendingCount` reflita o nosso cenário de teste.
const retryQueueState = { pendingCount: 0 };
vi.mock('../../../hooks/useRetryQueue', () => ({
  useRetryQueue: () => ({
    pendingCount: retryQueueState.pendingCount,
    isProcessing: false,
    processQueue: vi.fn(),
    clearQueue: vi.fn(),
  }),
}));

// Modal de confirmação abre e faz fetches — mockamos as APIs pra não quebrar
vi.mock('../../../api/shiftsApi', () => ({
  shiftsApi: {
    getMyToday: vi.fn().mockResolvedValue([]),
    getMine: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../api/attendanceApi', () => ({
  attendanceApi: {
    getActive: vi.fn().mockResolvedValue([]),
    checkIn: vi.fn().mockResolvedValue({}),
    checkOut: vi.fn().mockResolvedValue({}),
    getMyHistory: vi.fn().mockResolvedValue([]),
    syncOfflineEvents: vi.fn(),
  },
}));

describe('<DoctorHomeScreen />', () => {
  beforeEach(() => {
    offlineEvents.events = [];
    retryQueueState.pendingCount = 0;
    enqueueOfflineEventMock.mockReset();
    getCurrentPositionMock.mockClear();
  });

  it('renderiza dois botões: check-in e check-out', () => {
    renderWithProviders(
      <DoctorHomeScreen onCheckedIn={vi.fn()} onCheckedOut={vi.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: new RegExp(i18n.t('doctor.home.checkin'), 'i') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(i18n.t('doctor.home.checkout'), 'i') }),
    ).toBeInTheDocument();
  });

  it('renderiza o subtítulo "selecione uma opção"', () => {
    renderWithProviders(
      <DoctorHomeScreen onCheckedIn={vi.fn()} onCheckedOut={vi.fn()} />,
    );
    expect(
      screen.getByText(i18n.t('doctor.home.selectOption')),
    ).toBeInTheDocument();
  });

  it('não mostra indicador de pendentes quando não há eventos offline', () => {
    offlineEvents.events = [];
    renderWithProviders(
      <DoctorHomeScreen onCheckedIn={vi.fn()} onCheckedOut={vi.fn()} />,
    );
    // Sem eventos = sem badge de pendentes. Uma boa marca é o role="status" com contagem.
    expect(screen.queryByText(/\d+ pendente/i)).not.toBeInTheDocument();
  });

  it('mostra indicador quando há evento offline pendente', () => {
    offlineEvents.events = [
      {
        localEventId: 'e1',
        userId: 'u-1',
        clinicId: 'c-1',
        shiftId: 's-1',
        attendanceType: 'CheckIn',
        localDateTime: new Date().toISOString(),
        latitude: -23.5,
        longitude: -46.6,
        deviceId: 'dev-1',
        appVersion: '1.0.0',
        biometricValidated: true,
        syncStatus: 'Pending',
        retryCount: 0,
        lastSyncAttemptAt: null,
      },
    ];
    retryQueueState.pendingCount = 1;

    renderWithProviders(
      <DoctorHomeScreen onCheckedIn={vi.fn()} onCheckedOut={vi.fn()} />,
    );

    // O PendingOperationsIndicator renderiza role=status com o texto "1 pendente"
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/1 pendente/i);
  });

  it('clicar em check-in abre o modal (título "confirmar entrada")', async () => {
    renderWithProviders(
      <DoctorHomeScreen onCheckedIn={vi.fn()} onCheckedOut={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: new RegExp(i18n.t('doctor.home.checkin'), 'i') }),
    );

    expect(
      await screen.findByText(i18n.t('doctor.modal.title.checkin')),
    ).toBeInTheDocument();
  });

  it('clicar em check-out abre o modal (título "confirmar saída")', async () => {
    renderWithProviders(
      <DoctorHomeScreen onCheckedIn={vi.fn()} onCheckedOut={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: new RegExp(i18n.t('doctor.home.checkout'), 'i') }),
    );

    expect(
      await screen.findByText(i18n.t('doctor.modal.title.checkout')),
    ).toBeInTheDocument();
  });
});
