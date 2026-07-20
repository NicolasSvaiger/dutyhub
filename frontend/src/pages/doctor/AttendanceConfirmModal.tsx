import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import { attendanceApi, type AttendanceStatusResponse } from '../../api/attendanceApi';
import { useClinic } from '../../hooks/useClinic';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { formatShiftTime } from './dateFormat';
import { ModalClinicPicker } from './ModalClinicPicker';
import { formatHmCompactBR } from '../../utils/dateTimeBR';

export type AttendanceMode = 'checkin' | 'checkout';

interface AttendanceConfirmModalProps {
  mode: AttendanceMode;
  onClose: () => void;
  /** Called with the selected shiftId. Should return a promise that resolves when the API call completes. */
  onConfirm: (shiftId: string) => Promise<void>;
}

/** Formats an ISO datetime into "HHhMM", sempre no horário de Brasília. */
function formatCheckInTime(iso: string): string {
  return formatHmCompactBR(iso);
}

/**
 * Modal unificado de check-in / check-out.
 *
 * Usa uma ÚNICA chamada ao backend: `GET /attendance/status` que retorna:
 *   - hasActiveCheckIn / canCheckIn / canCheckOut
 *   - activeAttendance (dados do check-in em andamento, se houver)
 *   - availableShiftsToday (plantões pra check-in)
 *
 * O frontend não toma nenhuma decisão de negócio — apenas renderiza
 * condicionalmente baseado nos booleans retornados pelo backend.
 */
export function AttendanceConfirmModal({
  mode,
  onClose,
  onConfirm,
}: AttendanceConfirmModalProps) {
  const { t } = useTranslation();
  const { clinics, activeClinic, setActiveClinic } = useClinic();
  const { isOnline } = useNetworkStatus();

  const targetClinicId = activeClinic?.id;
  const cacheKey = `attendance_status:${targetClinicId ?? 'default'}`;

  // Uma única chamada unificada via hook — encapsula fetch + cache offline.
  const {
    data: status,
    loading,
    error: fetchError,
    fromCache: usingCache,
  } = useOfflineQuery<AttendanceStatusResponse>(
    () => attendanceApi.getStatus(targetClinicId),
    cacheKey,
    [mode, targetClinicId, isOnline],
    t('doctor.modal.offlineNoCache'),
  );

  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Override local quando o 409 traz os dados do bloqueio inline. */
  const [statusOverride, setStatusOverride] = useState<AttendanceStatusResponse | null>(null);

  // Status efetivo: override (pós-409) ou dados do hook
  const effectiveStatus = statusOverride ?? status;

  // Pre-select shift quando os dados chegam
  useEffect(() => {
    if (!effectiveStatus) return;
    if (mode === 'checkin' && effectiveStatus.canCheckIn && effectiveStatus.availableShiftsToday.length > 0) {
      setSelectedShiftId(effectiveStatus.availableShiftsToday[0].shiftId);
    } else if (mode === 'checkout' && effectiveStatus.canCheckOut && effectiveStatus.activeAttendance) {
      setSelectedShiftId(effectiveStatus.activeAttendance.shiftId);
    } else {
      setSelectedShiftId(null);
    }
  }, [effectiveStatus, mode]);

  const handleConfirm = async () => {
    if (!selectedShiftId || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedShiftId);
    } catch (err: unknown) {
      const apiErr = err as {
        response?: { status?: number; data?: { detail?: string; message?: string; code?: string; activeAttendance?: unknown } };
        message?: string;
      };

      // 409 = backend já tem a info inline no body (code + activeAttendance)
      if (apiErr.response?.status === 409 && apiErr.response.data?.activeAttendance) {
        // Atualiza o status local pra refletir o bloqueio sem fazer outra chamada
        setStatusOverride({
          hasActiveCheckIn: true,
          canCheckIn: false,
          canCheckOut: true,
          activeAttendance: apiErr.response.data.activeAttendance as AttendanceStatusResponse['activeAttendance'],
          availableShiftsToday: [],
        });
        setSelectedShiftId(null);
        setSubmitting(false);
        return;
      }

      setError(
        apiErr.response?.data?.detail ??
          apiErr.response?.data?.message ??
          apiErr.message ??
          t('doctor.errors.generic'),
      );
      setSubmitting(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (submitting) return;
    if (e.target === e.currentTarget) onClose();
  };

  // ── Derivações de apresentação (zero lógica de negócio) ──────────────

  const isCheckIn = mode === 'checkin';
  const title = isCheckIn ? t('doctor.modal.title.checkin') : t('doctor.modal.title.checkout');
  const subtitle = isCheckIn ? t('doctor.modal.subtitle.checkin') : t('doctor.modal.subtitle.checkout');
  const confirmBtnClass = isCheckIn ? styles.btnTeal : styles.btnOrange;

  // Estados mutuamente exclusivos derivados do `effectiveStatus`:
  const activeError = error ?? fetchError;
  const showBlocked = !loading && effectiveStatus !== null && isCheckIn && effectiveStatus.hasActiveCheckIn;
  const showShifts = !loading && !showBlocked && effectiveStatus !== null && !activeError &&
    ((isCheckIn && (effectiveStatus.availableShiftsToday?.length ?? 0) > 0) ||
     (!isCheckIn && effectiveStatus.canCheckOut));
  const showEmpty = !loading && !showBlocked && !activeError && effectiveStatus !== null &&
    ((isCheckIn && !effectiveStatus.hasActiveCheckIn && (effectiveStatus.availableShiftsToday?.length ?? 0) === 0) ||
     (!isCheckIn && !effectiveStatus.canCheckOut));

  const emptyMessage = isCheckIn
    ? t('doctor.modal.empty.checkin')
    : t('doctor.modal.empty.checkout');

  const blockingClinicName = effectiveStatus?.activeAttendance?.clinicName ?? t('doctor.modal.unitFallback');

  // ── Render via portal ────────────────────────────────────────────────

  return createPortal(
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modalSheet}>
        <div className={styles.modalTitle}>{title}</div>
        <div className={styles.modalSub}>{subtitle}</div>

        {usingCache && (
          <div className={styles.modalOfflineHint} role="status">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <span>{t('doctor.modal.offlineCacheHint')}</span>
          </div>
        )}

        {/* Clinic picker — apenas pra check-in quando não bloqueado */}
        {isCheckIn && !showBlocked && (
          <div className={styles.modalField}>
            <div className={styles.modalFieldLabel}>{t('doctor.modal.unit')}</div>
            {clinics.length > 1 ? (
              <ModalClinicPicker
                clinics={clinics}
                activeClinic={activeClinic}
                onSelect={setActiveClinic}
                disabled={submitting}
              />
            ) : (
              <div className={styles.modalFieldReadonly}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21V12h6v9" />
                </svg>
                <span>{activeClinic?.name ?? t('doctor.modal.unitFallback')}</span>
              </div>
            )}
          </div>
        )}

        {/* Estado bloqueado: check-in ativo impede novo check-in */}
        {showBlocked && effectiveStatus?.activeAttendance && (
          <div className={styles.modalField}>
            <div className={styles.modalBlocked} role="status">
              <div className={styles.modalBlockedTitle}>
                {t('doctor.modal.blocked.title')}
              </div>
              <div className={styles.modalBlockedBody}>
                <Trans
                  i18nKey="doctor.modal.blocked.body"
                  values={{
                    time: formatCheckInTime(effectiveStatus.activeAttendance.checkInTime),
                    clinic: blockingClinicName,
                  }}
                  components={{ strong: <strong /> }}
                />
              </div>
              <div className={styles.modalBlockedHint}>
                {t('doctor.modal.blocked.hint')}
              </div>
            </div>
          </div>
        )}

        {/* Lista de shifts / checkout option */}
        {!showBlocked && (
          <div className={styles.modalField}>
            <div className={styles.modalFieldLabel}>{t('doctor.modal.shift')}</div>

            {loading && (
              <div className={styles.modalFieldReadonly}>
                <span style={{ color: 'var(--muted)' }}>{t('doctor.modal.loading')}</span>
              </div>
            )}

            {showEmpty && (
              <div className={styles.modalEmpty} role="status">
                {emptyMessage}
              </div>
            )}

            {showShifts && isCheckIn && effectiveStatus!.availableShiftsToday.length === 1 && (
              <div className={styles.modalFieldReadonly}>
                <div>
                  <div style={{ fontWeight: 700 }}>{effectiveStatus!.availableShiftsToday[0].title}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                    {formatShiftTime(effectiveStatus!.availableShiftsToday[0].startTime)} – {formatShiftTime(effectiveStatus!.availableShiftsToday[0].endTime)}
                  </div>
                </div>
              </div>
            )}

            {showShifts && isCheckIn && effectiveStatus!.availableShiftsToday.length > 1 && (
              <div className={styles.modalOptionList} role="radiogroup">
                {effectiveStatus!.availableShiftsToday.map((opt) => {
                  const active = opt.shiftId === selectedShiftId;
                  return (
                    <button
                      key={opt.shiftId}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`${styles.modalOption} ${active ? styles.modalOptionActive : ''}`}
                      onClick={() => setSelectedShiftId(opt.shiftId)}
                      disabled={submitting}
                    >
                      <div className={styles.modalOptionText}>
                        <div className={styles.modalOptionPrimary}>{opt.title}</div>
                        <div className={styles.modalOptionSecondary}>
                          {formatShiftTime(opt.startTime)} – {formatShiftTime(opt.endTime)}
                        </div>
                      </div>
                      <div className={styles.modalOptionRadio} aria-hidden="true">
                        {active && <div className={styles.modalOptionRadioDot} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {showShifts && !isCheckIn && effectiveStatus?.activeAttendance && (
              <div className={styles.modalFieldReadonly}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {t('doctor.modal.checkinAt', { time: formatCheckInTime(effectiveStatus.activeAttendance.checkInTime) })}
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                    {effectiveStatus.activeAttendance.clinicName}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeError && (
          <div className={styles.modalError} role="alert">
            {activeError}
          </div>
        )}

        <div className={styles.modalBtns}>
          <button
            className={`${styles.btn} ${styles.btnGhost} ${styles.btnGhostNeutral}`}
            onClick={onClose}
            type="button"
            disabled={submitting}
          >
            {showEmpty || showBlocked ? t('doctor.modal.close') : t('doctor.modal.no')}
          </button>
          {showShifts && (
            <button
              className={`${styles.btn} ${confirmBtnClass}`}
              onClick={handleConfirm}
              type="button"
              disabled={loading || submitting || !selectedShiftId}
            >
              {submitting ? t('doctor.modal.processing') : t('doctor.modal.confirm')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
