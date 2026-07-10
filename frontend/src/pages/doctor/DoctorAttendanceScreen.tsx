import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import { CheckmarkIcon, LogoutArrowIcon, UserAvatarIcon } from './icons';
import { DoctorHeader } from './DoctorHeader';
import { useAuth } from '../../hooks/useAuth';
import { formatTime } from './useClock';
import { formatDate } from './dateFormat';
import type { ConfirmationData } from './types';

export interface DoctorAttendanceScreenProps {
  lastCheckIn: ConfirmationData | null;
  lastCheckOut: ConfirmationData | null;
}

/**
 * Tela "Presença": mostra em um só lugar o último check-in E o último check-out
 * do médico, empilhados. Substitui as antigas telas separadas de confirmação
 * — a experiência celebratória fica na navegação (auto redireciona pra cá após
 * o check-in/check-out) mas os dois registros ficam sempre visíveis juntos.
 */
export function DoctorAttendanceScreen({
  lastCheckIn,
  lastCheckOut,
}: DoctorAttendanceScreenProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const displayName = user?.name ?? user?.email ?? t('doctor.role');

  return (
    <div className={`${styles.screen} ${styles.screenActive} ${styles.screenAttendance}`}>
      <DoctorHeader />

      <div className={styles.attendanceBody}>
        {/* ── ÚLTIMO CHECK-IN ── */}
        <section className={styles.attendanceSection}>
          <div className={styles.attendanceSectionHeader}>
            <div className={`${styles.attendanceSectionIcon} ${styles.iconTeal}`}>
              <CheckmarkIcon size={18} />
            </div>
            <div>
              <div className={styles.attendanceSectionTitle}>
                {t('doctor.attendance.lastCheckin')}
              </div>
              <div className={styles.attendanceSectionSubtitle}>
                {t('doctor.confirmation.header.checkinSubtitle')}
              </div>
            </div>
          </div>

          {lastCheckIn ? (
            <div className={styles.personCard}>
              <div className={styles.personRow}>
                <div className={styles.personAvatar} style={{ background: 'none', padding: 0 }}>
                  <UserAvatarIcon variant="teal" size={44} />
                </div>
                <div>
                  <div className={styles.personName}>{displayName}</div>
                  <div className={styles.personRole}>{t('doctor.role')}</div>
                </div>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('doctor.confirmation.date')}</span>
                <span className={styles.detailValue}>{formatDate(lastCheckIn.dateTime)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('doctor.confirmation.checkinTime')}</span>
                <span className={styles.detailValueGreen}>{formatTime(lastCheckIn.dateTime)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('doctor.confirmation.location')}</span>
                <span className={styles.detailValue}>{lastCheckIn.clinicName}</span>
              </div>
            </div>
          ) : (
            <div className={styles.attendanceEmpty}>
              <div className={styles.attendanceEmptyIcon}>—</div>
              <div className={styles.attendanceEmptyText}>
                {t('doctor.confirmation.emptyCheckin.title')}
              </div>
              <div className={styles.attendanceEmptyHint}>
                {t('doctor.confirmation.emptyCheckin.hint')}
              </div>
            </div>
          )}
        </section>

        {/* ── ÚLTIMO CHECK-OUT ── */}
        <section className={styles.attendanceSection}>
          <div className={styles.attendanceSectionHeader}>
            <div className={`${styles.attendanceSectionIcon} ${styles.iconOrange}`}>
              <LogoutArrowIcon size={18} />
            </div>
            <div>
              <div className={styles.attendanceSectionTitle}>
                {t('doctor.attendance.lastCheckout')}
              </div>
              <div className={styles.attendanceSectionSubtitle}>
                {t('doctor.confirmation.header.checkoutSubtitle')}
              </div>
            </div>
          </div>

          {lastCheckOut ? (
            <div className={`${styles.personCard} ${styles.personCardOrange}`}>
              <div className={`${styles.personRow} ${styles.personRowOrange}`}>
                <div className={styles.personAvatar} style={{ background: 'none', padding: 0 }}>
                  <UserAvatarIcon variant="orange" size={44} />
                </div>
                <div>
                  <div className={styles.personName}>{displayName}</div>
                  <div className={styles.personRole}>{t('doctor.role')}</div>
                </div>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('doctor.confirmation.date')}</span>
                <span className={styles.detailValue}>{formatDate(lastCheckOut.dateTime)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('doctor.confirmation.checkoutTime')}</span>
                <span className={styles.detailValueOrange}>
                  {formatTime(lastCheckOut.dateTime)}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('doctor.confirmation.location')}</span>
                <span className={styles.detailValue}>{lastCheckOut.clinicName}</span>
              </div>
            </div>
          ) : (
            <div className={styles.attendanceEmpty}>
              <div className={styles.attendanceEmptyIcon}>—</div>
              <div className={styles.attendanceEmptyText}>
                {t('doctor.confirmation.emptyCheckout.title')}
              </div>
              <div className={styles.attendanceEmptyHint}>
                {t('doctor.confirmation.emptyCheckout.hint')}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
