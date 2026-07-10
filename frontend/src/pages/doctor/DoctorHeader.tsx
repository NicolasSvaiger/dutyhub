import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import { LogoHeader } from './icons';
import { useClock } from './useClock';
import { useAuth } from '../../hooks/useAuth';
import { NotificationBell } from './NotificationBell';

/**
 * Cabeçalho compartilhado por todas as telas do médico.
 * Mantém a saudação, o sino de notificações e o relógio consistentes
 * ao longo da sessão — o estado específico da tela (check-in feito,
 * relatório sendo consultado, etc.) fica no body de cada tela.
 */
export function DoctorHeader() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const clock = useClock();

  const displayName = user?.name ?? user?.email ?? t('doctor.role');

  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderTop}>
        <div className={styles.pageHeaderLeft}>
          <LogoHeader size={44} />
          <div className={styles.pageHeaderText}>
            <div className={styles.pageTitle}>
              {t('doctor.home.greeting', { name: displayName })}
            </div>
            <div className={styles.pageSubtitle}>{t('doctor.home.welcome')}</div>
          </div>
        </div>
        <div className={styles.pageHeaderRight}>
          <NotificationBell />
          <div className={styles.pageHeaderClock}>
            <div className={styles.pageHeaderClockLabel}>{t('doctor.home.now')}</div>
            <div className={styles.pageHeaderClockTime}>{clock}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
