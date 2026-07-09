import styles from './DoctorPage.module.css';
import { LogoHeader, LogoutArrowIcon, UserAvatarIcon } from './icons';
import { useAuth } from '../../hooks/useAuth';
import { formatTime } from './useClock';
import { formatDate } from './DoctorCheckInConfirmScreen';
import type { ConfirmationData } from './types';

export interface DoctorCheckOutConfirmScreenProps {
  data: ConfirmationData;
}

export function DoctorCheckOutConfirmScreen({ data }: DoctorCheckOutConfirmScreenProps) {
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
              <div className={styles.pageTitle}>Check-Out</div>
              <div className={styles.pageSubtitle}>Registro de saída</div>
            </div>
          </div>
          <LogoutArrowIcon size={28} className={styles.confirmCheck} />
        </div>
      </div>

      {/* Confirm Body */}
      <div className={styles.confirmBody}>
        {/* Orange gradient circle with logout arrow */}
        <div className={`${styles.confirmIconWrap} ${styles.iconOrange}`}>
          <LogoutArrowIcon size={36} />
        </div>

        <div className={styles.confirmTitleBig} style={{ color: 'var(--orange)' }}>
          Check-Out realizado!
        </div>
        <div className={styles.confirmSubtitle}>Identidade confirmada com sucesso</div>

        {/* Person Card (orange variant) */}
        <div
          className={styles.personCard}
          style={{ borderColor: 'rgba(245,166,35,.2)', background: '#fffaf0' }}
        >
          <div className={styles.personRow} style={{ borderColor: 'rgba(245,166,35,.2)' }}>
            <div className={styles.personAvatar} style={{ background: 'none', padding: 0 }}>
              <UserAvatarIcon variant="orange" size={46} />
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
            <span className={styles.detailLabel}>Hora de saída</span>
            <span className={styles.detailValue} style={{ color: 'var(--orange)' }}>
              {timeStr}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Local</span>
            <span className={styles.detailValue}>{data.clinicName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Status</span>
            <span className={styles.detailValue} style={{ color: 'var(--orange)' }}>
              ✔ Confirmado
            </span>
          </div>
        </div>

        <div className={styles.confirmMsg} style={{ marginTop: '.8rem' }}>
          Bom descanso!
        </div>
      </div>
    </div>
  );
}
