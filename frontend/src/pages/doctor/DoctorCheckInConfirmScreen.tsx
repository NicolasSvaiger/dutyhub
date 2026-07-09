import styles from './DoctorPage.module.css';
import { LogoHeader, CheckmarkIcon, UserAvatarIcon } from './icons';
import { useAuth } from '../../hooks/useAuth';
import { formatTime } from './useClock';
import type { ConfirmationData } from './types';

export interface DoctorCheckInConfirmScreenProps {
  data: ConfirmationData;
}

/**
 * Formats a Date into a localized date string (DD/MM/YYYY).
 * Exported for testability (Property 5).
 */
export function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function DoctorCheckInConfirmScreen({ data }: DoctorCheckInConfirmScreenProps) {
  const { user } = useAuth();
  const displayName = user?.email ?? 'Médico(a)';

  const dateStr = formatDate(data.dateTime);
  const timeStr = formatTime(data.dateTime);

  return (
    <div className={`${styles.screen} ${styles.screenActive} ${styles.confirmScreen}`}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderTop}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
            <LogoHeader size={44} />
            <div>
              <div className={styles.pageTitle}>Check-In</div>
              <div className={styles.pageSubtitle}>Registro de entrada</div>
            </div>
          </div>
          <CheckmarkIcon size={28} className={styles.confirmCheck} />
        </div>
      </div>

      {/* Confirm Body */}
      <div className={styles.confirmBody}>
        {/* Teal gradient circle with checkmark */}
        <div className={`${styles.confirmIconWrap} ${styles.iconTeal}`}>
          <span className={styles.confirmCheck}>✓</span>
        </div>

        <div className={styles.confirmTitleBig}>Check-In realizado!</div>
        <div className={styles.confirmSubtitle}>Identidade confirmada com sucesso</div>

        {/* Person Card */}
        <div className={styles.personCard}>
          <div className={styles.personRow}>
            <div className={styles.personAvatar} style={{ background: 'none', padding: 0 }}>
              <UserAvatarIcon variant="teal" size={46} />
            </div>
            <div>
              <div className={styles.personName}>{displayName}</div>
              <div className={styles.personRole}>CRM: 5485 – SP</div>
            </div>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Data</span>
            <span className={styles.detailValue}>{dateStr}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Hora de entrada</span>
            <span className={styles.detailValueGreen}>{timeStr}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Local</span>
            <span className={styles.detailValue}>{data.clinicName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Status</span>
            <span className={styles.detailValueGreen}>✔ Confirmado</span>
          </div>
        </div>

        <div className={styles.confirmMsg} style={{ marginTop: '.8rem' }}>
          Bom trabalho!
        </div>
      </div>
    </div>
  );
}
