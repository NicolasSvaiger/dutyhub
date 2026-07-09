import { NavHome, NavCheckIn, NavCheckOut, NavReports, NavLogout } from './icons';
import type { DoctorScreen } from './types';
import styles from './DoctorPage.module.css';

interface DoctorBottomNavProps {
  activeScreen: DoctorScreen;
  onNavigate: (screen: DoctorScreen) => void;
  onLogout: () => void;
}

export function DoctorBottomNav({ activeScreen, onNavigate, onLogout }: DoctorBottomNavProps) {
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
        <span className={styles.navLabel}>Início</span>
      </button>

      <button
        className={`${styles.navBtn} ${activeScreen === 'checkin-confirm' ? styles.navBtnActive : ''}`}
        onClick={() => onNavigate('checkin-confirm')}
        type="button"
      >
        <div className={styles.navIcon}>
          <NavCheckIn />
        </div>
        <span className={styles.navLabel}>Check-in</span>
      </button>

      <button
        className={`${styles.navBtn} ${styles.navOut} ${activeScreen === 'checkout-confirm' ? styles.navBtnActive : ''}`}
        onClick={() => onNavigate('checkout-confirm')}
        type="button"
      >
        <div className={styles.navIcon}>
          <NavCheckOut />
        </div>
        <span className={styles.navLabel}>Check-out</span>
      </button>

      <button
        className={`${styles.navBtn} ${activeScreen === 'reports' ? styles.navBtnActive : ''}`}
        onClick={() => onNavigate('reports')}
        type="button"
      >
        <div className={styles.navIcon}>
          <NavReports />
        </div>
        <span className={styles.navLabel}>Relatórios</span>
      </button>

      <button
        className={styles.navBtn}
        onClick={onLogout}
        type="button"
      >
        <div className={styles.navIcon}>
          <NavLogout />
        </div>
        <span className={styles.navLabel}>Sair</span>
      </button>
    </nav>
  );
}
