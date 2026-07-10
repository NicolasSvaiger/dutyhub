import { useTranslation } from 'react-i18next';
import { NavHome, NavReports } from './icons';
import type { DoctorScreen } from './types';
import styles from './DoctorPage.module.css';

interface DoctorBottomNavProps {
  activeScreen: DoctorScreen;
  onNavigate: (screen: DoctorScreen) => void;
}

/** Ícone de crachá com check para a aba "Presença". */
function NavAttendance() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 18c0-2.5 2.5-4 5-4s5 1.5 5 4" />
    </svg>
  );
}

/** Ícone de calendário para a aba "Plantões". */
function NavShifts() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/** Ícone de engrenagem para "Configurações". */
function NavSettings() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function DoctorBottomNav({ activeScreen, onNavigate }: DoctorBottomNavProps) {
  const { t } = useTranslation();

  return (
    <nav className={styles.bottomNav}>
      <button
        className={`${styles.navBtn} ${activeScreen === 'home' ? styles.navBtnActive : ''}`}
        onClick={() => onNavigate('home')}
        type="button"
      >
        <div className={styles.navIcon}>
          <NavHome />
        </div>
        <span className={styles.navLabel}>{t('doctor.nav.home')}</span>
      </button>

      <button
        className={`${styles.navBtn} ${activeScreen === 'presenca' ? styles.navBtnActive : ''}`}
        onClick={() => onNavigate('presenca')}
        type="button"
      >
        <div className={styles.navIcon}>
          <NavAttendance />
        </div>
        <span className={styles.navLabel}>{t('doctor.nav.attendance')}</span>
      </button>

      <button
        className={`${styles.navBtn} ${activeScreen === 'plantoes' ? styles.navBtnActive : ''}`}
        onClick={() => onNavigate('plantoes')}
        type="button"
      >
        <div className={styles.navIcon}>
          <NavShifts />
        </div>
        <span className={styles.navLabel}>{t('doctor.nav.shifts')}</span>
      </button>

      <button
        className={`${styles.navBtn} ${activeScreen === 'reports' ? styles.navBtnActive : ''}`}
        onClick={() => onNavigate('reports')}
        type="button"
      >
        <div className={styles.navIcon}>
          <NavReports />
        </div>
        <span className={styles.navLabel}>{t('doctor.nav.reports')}</span>
      </button>

      <button
        className={`${styles.navBtn} ${activeScreen === 'settings' ? styles.navBtnActive : ''}`}
        onClick={() => onNavigate('settings')}
        type="button"
      >
        <div className={styles.navIcon}>
          <NavSettings />
        </div>
        <span className={styles.navLabel}>{t('doctor.nav.settings')}</span>
      </button>
    </nav>
  );
}
