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

  /** Ícone do "Início" — casa. Reaproveitado no item de nav e não muda por seção. */
  const homeIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  );
  const realtimeIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
  const frequenciaIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  );
  const ausenciasIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
  const atrasosIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
  const historicoIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
  const escalasIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
  const kpisIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
  const tvIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );

  // Estrutura e ordem idênticas ao mock (originais/Prefeitura/op-*.html):
  // Principal (Início, Tempo Real, Painel TV) → Relatórios (Frequência,
  // Ausências, Atrasos) → Gestão (Unidades/UPAs, Escalas, Indicadores).
  const navSections: Array<{
    label: string;
    items: Array<{ view: PrefeituraView; key: string; icon: ReactNode }>;
  }> = [
    {
      label: t('prefeitura.nav.sectionMain'),
      items: [
        { view: 'home', key: 'home', icon: homeIcon },
        { view: 'realtime', key: 'realtime', icon: realtimeIcon },
      ],
    },
    {
      label: t('prefeitura.nav.sectionReports'),
      items: [
        { view: 'frequencia', key: 'frequencia', icon: frequenciaIcon },
        { view: 'ausencias', key: 'ausencias', icon: ausenciasIcon },
        { view: 'atrasos', key: 'atrasos', icon: atrasosIcon },
      ],
    },
    {
      label: t('prefeitura.nav.sectionManagement'),
      items: [
        { view: 'historico', key: 'historico', icon: historicoIcon },
        { view: 'escalas', key: 'escalas', icon: escalasIcon },
        { view: 'kpis', key: 'kpis', icon: kpisIcon },
      ],
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

        {navSections.map((section, idx) => (
          <div key={section.label}>
            <div className={styles.navSectionLabel}>{section.label}</div>
            {section.items.map((item) => (
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
            {/* "Painel TV" fica na section Principal, depois de Tempo Real —
                é um <button> comum (abre nova aba), não muda activeView. */}
            {idx === 0 && (
              <button type="button" className={styles.navItem} onClick={openTvMode}>
                {tvIcon}
                {t('prefeitura.nav.items.tv')}
              </button>
            )}
          </div>
        ))}

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
              <div className={styles.topbarTitle}>{t(`prefeitura.nav.pageTitles.${activeView}`)}</div>
              <div className={styles.topbarSub}>{dateStr}</div>
            </div>
          </div>
        </div>

        <div className={styles.content}>
          {activeView === 'home' && <PrefeituraWelcome onNavigate={navigate} onOpenTvMode={openTvMode} />}
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


