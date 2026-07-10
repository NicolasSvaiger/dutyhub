import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import { CheckmarkIcon, LogoutArrowIcon } from './icons';
import { AttendanceConfirmModal, type AttendanceMode } from './AttendanceConfirmModal';
import { DoctorHeader } from './DoctorHeader';
import { useAuth } from '../../hooks/useAuth';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useOfflineSync } from '../../hooks/useOfflineSync';
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const { getCurrentPosition } = useGeolocation();
  const { enqueueOfflineEvent, events } = useOfflineSync();
  const { activeClinic } = useClinic();

  const [modalMode, setModalMode] = useState<AttendanceMode | null>(null);
  const [outerError, setOuterError] = useState<string | null>(null);

  const hasPendingEvents = events.some(
    (e) => e.syncStatus === 'Pending' || e.syncStatus === 'Failed'
  );

  const clinicName = activeClinic?.name ?? t('doctor.modal.unitFallback');

  const performAttendance = async (mode: AttendanceMode, shiftId: string) => {
    let latitude: number;
    let longitude: number;

    try {
      const pos = await getCurrentPosition();
      latitude = pos.latitude;
      longitude = pos.longitude;
    } catch (geoError: unknown) {
      const msg = geoError instanceof Error ? geoError.message : t('doctor.errors.geolocation');
      throw new Error(msg);
    }

    const payload = buildAttendancePayload(latitude, longitude, shiftId);

    try {
      if (mode === 'checkin') {
        await attendanceApi.checkIn(payload);
      } else {
        await attendanceApi.checkOut(payload);
      }

      setModalMode(null);
      const confirmation: ConfirmationData = {
        type: mode,
        dateTime: new Date(),
        clinicName,
      };
      if (mode === 'checkin') onCheckedIn(confirmation);
      else onCheckedOut(confirmation);
    } catch (apiError: unknown) {
      if (isNetworkError(apiError)) {
        enqueueOfflineEvent({
          userId: user?.userId ?? '',
          clinicId: activeClinic?.id ?? user?.clinicId ?? '',
          shiftId: payload.shiftId,
          attendanceType: mode === 'checkin' ? 'CheckIn' : 'CheckOut',
          latitude,
          longitude,
          biometricValidated: true,
        });
        setModalMode(null);
        setOuterError(
          mode === 'checkin'
            ? t('doctor.home.offlineCheckin')
            : t('doctor.home.offlineCheckout')
        );
        return;
      }

      throw apiError;
    }
  };

  const openCheckIn = () => {
    setOuterError(null);
    setModalMode('checkin');
  };

  const openCheckOut = () => {
    setOuterError(null);
    setModalMode('checkout');
  };

  const closeModal = () => setModalMode(null);

  return (
    <div className={`${styles.screen} ${styles.screenActive} ${styles.screenHome}`}>
      <DoctorHeader />

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
            {t('doctor.home.selectOption')}
          </p>

          <button
            className={`${styles.btn} ${styles.btnTeal}`}
            style={{ maxWidth: 300, width: '100%' }}
            onClick={openCheckIn}
          >
            <CheckmarkIcon size={20} />
            {t('doctor.home.checkin')}
          </button>

          <button
            className={`${styles.btn} ${styles.btnOrange}`}
            style={{ maxWidth: 300, width: '100%' }}
            onClick={openCheckOut}
          >
            <LogoutArrowIcon size={20} />
            {t('doctor.home.checkout')}
          </button>

          {outerError && (
            <p
              role="alert"
              style={{
                fontSize: '.85rem',
                fontWeight: 700,
                color: 'var(--danger)',
                textAlign: 'center',
                marginTop: '.5rem',
              }}
            >
              {outerError}
            </p>
          )}

          {hasPendingEvents && (
            <div style={{ marginTop: '.8rem' }}>
              <PendingOperationsIndicator />
            </div>
          )}
        </div>
      </div>

      {modalMode && (
        <AttendanceConfirmModal
          mode={modalMode}
          onClose={closeModal}
          onConfirm={(shiftId) => performAttendance(modalMode, shiftId)}
        />
      )}
    </div>
  );
}
