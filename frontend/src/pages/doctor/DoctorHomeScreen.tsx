import { useState } from 'react';
import styles from './DoctorPage.module.css';
import { LogoHeader, CheckmarkIcon, LogoutArrowIcon } from './icons';
import { useClock } from './useClock';
import { useAuth } from '../../hooks/useAuth';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useClinic } from '../../hooks/useClinic';
import { attendanceApi } from '../../api/attendanceApi';
import { PendingOperationsIndicator } from '../../components/PendingOperationsIndicator';
import { isNetworkError } from '../../utils/networkError';
import { getDeviceId } from '../../utils/offlineEventQueue';
import type { ConfirmationData } from './types';

export interface DoctorHomeScreenProps {
  onCheckedIn: (data: ConfirmationData) => void;
  onCheckedOut: (data: ConfirmationData) => void;
}

/**
 * Constructs the attendance API payload from coordinates.
 * Exported for testability (Property 4).
 */
export function buildAttendancePayload(
  latitude: number,
  longitude: number,
  shiftId: string
) {
  const deviceId = getDeviceId();
  return {
    shiftId,
    latitude,
    longitude,
    deviceId,
    biometricValidated: true,
  };
}

export function DoctorHomeScreen({ onCheckedIn, onCheckedOut }: DoctorHomeScreenProps) {
  const { user } = useAuth();
  const clock = useClock();
  const { getCurrentPosition } = useGeolocation();
  const { enqueueOfflineEvent, events } = useOfflineSync();
  const { isOnline } = useNetworkStatus();
  const { activeClinic } = useClinic();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPendingEvents = events.some(
    (e) => e.syncStatus === 'Pending' || e.syncStatus === 'Failed'
  );

  const handleCheckIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const { latitude, longitude } = await getCurrentPosition();
      const payload = buildAttendancePayload(latitude, longitude, 'current-shift');

      try {
        await attendanceApi.checkIn(payload);
        onCheckedIn({
          type: 'checkin',
          dateTime: new Date(),
          clinicName: activeClinic?.name ?? 'Unidade',
        });
      } catch (apiError: unknown) {
        if (isNetworkError(apiError)) {
          enqueueOfflineEvent({
            userId: user?.userId ?? '',
            clinicId: activeClinic?.id ?? user?.clinicId ?? '',
            shiftId: payload.shiftId,
            attendanceType: 'CheckIn',
            latitude,
            longitude,
            biometricValidated: true,
          });
          setError('Sem conexão. Check-in salvo offline.');
        } else {
          const err = apiError as { response?: { data?: { message?: string } }; message?: string };
          setError(err.response?.data?.message ?? err.message ?? 'Erro ao realizar check-in');
        }
      }
    } catch (geoError: unknown) {
      const msg = geoError instanceof Error ? geoError.message : 'Erro ao obter localização';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setLoading(true);
    setError(null);

    try {
      const { latitude, longitude } = await getCurrentPosition();
      const payload = buildAttendancePayload(latitude, longitude, 'current-shift');

      try {
        await attendanceApi.checkOut(payload);
        onCheckedOut({
          type: 'checkout',
          dateTime: new Date(),
          clinicName: activeClinic?.name ?? 'Unidade',
        });
      } catch (apiError: unknown) {
        if (isNetworkError(apiError)) {
          enqueueOfflineEvent({
            userId: user?.userId ?? '',
            clinicId: activeClinic?.id ?? user?.clinicId ?? '',
            shiftId: payload.shiftId,
            attendanceType: 'CheckOut',
            latitude,
            longitude,
            biometricValidated: true,
          });
          setError('Sem conexão. Check-out salvo offline.');
        } else {
          const err = apiError as { response?: { data?: { message?: string } }; message?: string };
          setError(err.response?.data?.message ?? err.message ?? 'Erro ao realizar check-out');
        }
      }
    } catch (geoError: unknown) {
      const msg = geoError instanceof Error ? geoError.message : 'Erro ao obter localização';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const displayName = user?.email ?? 'Médico(a)';

  return (
    <div className={`${styles.screen} ${styles.screenActive} ${styles.screenHome}`}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderTop}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
            <LogoHeader size={44} />
            <div>
              <div className={styles.pageTitle}>Olá, {displayName}!</div>
              <div className={styles.pageSubtitle}>Bem-vindo(a) de volta</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 600, opacity: 0.8 }}>Agora são</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{clock}</div>
          </div>
        </div>
      </div>

      {/* Panel Surface */}
      <div className={styles.panelSurface}>
        <div className={`${styles.panelSurfaceInner} ${styles.homeCenter}`}>
          <p
            style={{
              fontSize: '.82rem',
              fontWeight: 700,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
            }}
          >
            Selecione a opção desejada
          </p>

          {/* Check-in button */}
          <button
            className={`${styles.btn} ${styles.btnTeal}`}
            style={{ maxWidth: 300, width: '100%' }}
            onClick={handleCheckIn}
            disabled={loading}
          >
            <CheckmarkIcon size={20} />
            {loading ? 'Processando...' : 'Check-in'}
          </button>

          {/* Check-out button */}
          <button
            className={`${styles.btn} ${styles.btnOrange}`}
            style={{ maxWidth: 300, width: '100%' }}
            onClick={handleCheckOut}
            disabled={loading}
          >
            <LogoutArrowIcon size={20} />
            {loading ? 'Processando...' : 'Check-out'}
          </button>

          {/* Error message */}
          {error && (
            <p
              role="alert"
              style={{
                fontSize: '.85rem',
                fontWeight: 700,
                color: '#e53e3e',
                textAlign: 'center',
                marginTop: '.5rem',
              }}
            >
              {error}
            </p>
          )}

          {/* Pending operations indicator */}
          {hasPendingEvents && (
            <div style={{ marginTop: '.8rem' }}>
              <PendingOperationsIndicator />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
