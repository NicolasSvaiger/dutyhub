import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { BRAND } from '../../config/brand';
import type { PrefeituraView } from '../../types';
import { PrefeituraWelcome } from './PrefeituraWelcome';
import { PrefeituraKpis } from './PrefeituraKpis';
import { PrefeituraEscalas } from './PrefeituraEscalas';
import { PrefeituraFrequencia } from './PrefeituraFrequencia';
import { PrefeituraAtrasos } from './PrefeituraAtrasos';
import { PrefeituraAusencias } from './PrefeituraAusencias';
import { PrefeituraHistorico } from './PrefeituraHistorico';
import { PrefeituraRealtime } from './PrefeituraRealtime';
import styles from './PrefeituraPage.module.css';

/**
 * Portal Prefeitura — layout state-based com sidebar + main content.
 * O <c>activeView</c> alterna o conteúdo sem mudar a URL (mesma técnica do
 * <c>AdminPage</c>); o modo TV fica em rota separada (/prefeitura/tv).
 *
 * Sprint 7C.1 entrega o layout + Welcome + Kpis. Escalas / Frequencia /
 * Atrasos / Ausencias entram na 7C.2, Historico / Realtime na 7C.3.
 */
export function PrefeituraPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeView, setActiveView] = useState<PrefeituraView>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const userName = user?.name ?? t('prefeitura.common.defaultUserName');
  const userInitials = userName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isDark = theme === 'dark';

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  function navigate(view: PrefeituraView) {
    setActiveView(view);
    setSidebarOpen(false);
  }

  function handleLogout() {
    logout();
    window.location.href = '/prefeitura/login';
  }

  function openTvMode() {
    // Nova aba pra não perder contexto do portal principal — display de
    // monitoramento vive numa TV/telão separado.
    window.open('/prefeitura/tv', '_blank', 'noopener,noreferrer');
    setSidebarOpen(false);
  }

  const navItems: Array<{ view: PrefeituraView; key: string; icon: ReactNode }> = [
    {
      view: 'home',
      key: 'home',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
          <polyline points="9 21 9 12 15 12 15 21" />
        </svg>
      ),
    },
    {
      view: 'kpis',
      key: 'kpis',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      view: 'escalas',
      key: 'escalas',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      view: 'frequencia',
      key: 'frequencia',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    },
    {
      view: 'atrasos',
      key: 'atrasos',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      view: 'ausencias',
      key: 'ausencias',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    },
    {
      view: 'historico',
      key: 'historico',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      view: 'realtime',
      key: 'realtime',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      ),
    },
  ];

  return (
    <div className={styles.root}>
      {sidebarOpen && (
        <button
          type="button"
          className={styles.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
          aria-label={t('prefeitura.nav.closeSidebar')}
        />
      )}

      <aside
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}
        aria-hidden={!sidebarOpen && typeof window !== 'undefined' && window.innerWidth < 780}
      >
        <div className={styles.sidebarLogo}>
          <div>
            <div className={styles.sidebarLogoName}>{BRAND.name}</div>
            <div className={styles.sidebarLogoTag}>{t('prefeitura.nav.tagline')}</div>
            <div className={styles.sidebarModule}>{t('prefeitura.nav.moduleLabel')}</div>
          </div>
        </div>

        <div className={styles.navSectionLabel}>{t('prefeitura.nav.sectionMain')}</div>
        {navItems.map((item) => (
          <button
            key={item.view}
            type="button"
            className={`${styles.navItem} ${activeView === item.view ? styles.active : ''}`}
            onClick={() => navigate(item.view)}
            aria-current={activeView === item.view ? 'page' : undefined}
          >
            {item.icon}
            {t(`prefeitura.nav.items.${item.key}`)}
          </button>
        ))}

        <div className={styles.navSectionLabel}>{t('prefeitura.nav.sectionDisplay')}</div>
        <button type="button" className={styles.navItem} onClick={openTvMode}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          {t('prefeitura.nav.items.tv')}
        </button>

        <div className={styles.sidebarActions}>
          <button
            type="button"
            onClick={toggleTheme}
            className={styles.themeToggleBtn}
            aria-label={isDark ? t('doctor.theme.toActivateLight') : t('doctor.theme.toActivateDark')}
          >
            {isDark ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            {isDark ? t('doctor.theme.light') : t('doctor.theme.dark')}
          </button>
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarUser}>
            <div className={styles.sidebarAvatar}>{userInitials}</div>
            <div>
              <div className={styles.sidebarUserName}>{userName}</div>
              <div className={styles.sidebarUserRole}>{t('prefeitura.nav.userRole')}</div>
            </div>
            <button
              type="button"
              className={styles.logoutBtn}
              title={t('prefeitura.nav.logout')}
              onClick={handleLogout}
              aria-label={t('prefeitura.nav.logout')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.hamburgerBtn}
              onClick={() => setSidebarOpen(true)}
              aria-label={t('prefeitura.nav.openSidebar')}
              aria-expanded={sidebarOpen}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div>
              <div className={styles.topbarTitle}>{t(`prefeitura.nav.items.${activeView}`)}</div>
              <div className={styles.topbarSub}>{dateStr}</div>
            </div>
          </div>
        </div>

        <div className={styles.content}>
          {activeView === 'home' && <PrefeituraWelcome />}
          {activeView === 'kpis' && <PrefeituraKpis />}
          {activeView === 'escalas' && <PrefeituraEscalas />}
          {activeView === 'frequencia' && <PrefeituraFrequencia />}
          {activeView === 'atrasos' && <PrefeituraAtrasos />}
          {activeView === 'ausencias' && <PrefeituraAusencias />}
          {activeView === 'historico' && <PrefeituraHistorico />}
          {activeView === 'realtime' && <PrefeituraRealtime />}
        </div>
      </main>
    </div>
  );
}


