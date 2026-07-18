import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { prefeituraApi, type PrefeituraDashboardResponse } from '../../api/prefeituraApi';
import styles from './PrefeituraWelcome.module.css';

/**
 * Sub-view "Início" do portal Prefeitura — chama getDashboard() no mount,
 * mostra hero card com gestor + KPIs do dia + últimos alertas.
 * Loading state (—) enquanto carrega; error state se a request falha.
 */
export function PrefeituraWelcome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<PrefeituraDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    prefeituraApi
      .getDashboard()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : '';
        setError(raw.includes('NO_ORGAN_CONTEXT') ? t('prefeitura.errors.noOrgan') : t('prefeitura.errors.generic'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const userName = user?.name ?? t('prefeitura.common.defaultUserName');
  const userEmail = user?.email ?? '';

  const dash = data;
  const compliance = dash ? `${dash.todayComplianceRate.toFixed(1)}%` : '—';
  const covered = dash ? `${dash.todayCoveredShifts}/${dash.todayExpectedShifts}` : '—';
  const absences = dash ? dash.todayOpenAbsences : '—';
  const late = dash ? dash.todayLateEvents : '—';
  const clinicCount = dash?.clinicCount ?? 0;

  return (
    <div className={styles.container}>
      {/* ── Hero card ── */}
      <section className={styles.hero}>
        <div className={styles.heroDots} />
        <div className={styles.heroInner}>
          <div className={styles.heroGreeting}>{t('prefeitura.welcome.greeting')}</div>
          <div className={styles.heroName}>{userName}</div>
          <div className={styles.heroEmail}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>{userEmail}</span>
          </div>
          <div className={styles.heroTags}>
            <div className={styles.heroTag}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              {t('prefeitura.welcome.tagGestor')}
            </div>
            <div className={styles.heroTag}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              {t('prefeitura.welcome.tagClinics', { count: clinicCount })}
            </div>
            {dash && (
              <div className={styles.heroTag}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {dash.periodLabel}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── KPI strip ── */}
      <section className={styles.kpiStrip} aria-label={t('prefeitura.welcome.kpisAriaLabel')}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>{t('prefeitura.welcome.kpiCompliance')}</div>
          <div className={styles.kpiValue}>{loading ? '—' : compliance}</div>
          <div className={styles.kpiSub}>{t('prefeitura.welcome.kpiComplianceSub')}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>{t('prefeitura.welcome.kpiCovered')}</div>
          <div className={styles.kpiValue}>{loading ? '—' : covered}</div>
          <div className={styles.kpiSub}>{t('prefeitura.welcome.kpiCoveredSub')}</div>
        </div>
        <div className={`${styles.kpiCard} ${styles.orange}`}>
          <div className={styles.kpiLabel}>{t('prefeitura.welcome.kpiLate')}</div>
          <div className={styles.kpiValue}>{loading ? '—' : late}</div>
          <div className={styles.kpiSub}>{t('prefeitura.welcome.kpiLateSub')}</div>
        </div>
        <div className={`${styles.kpiCard} ${styles.red}`}>
          <div className={styles.kpiLabel}>{t('prefeitura.welcome.kpiAbsences')}</div>
          <div className={styles.kpiValue}>{loading ? '—' : absences}</div>
          <div className={styles.kpiSub}>{t('prefeitura.welcome.kpiAbsencesSub')}</div>
        </div>
      </section>

      {/* ── Alertas recentes ── */}
      <section className={styles.alertsCard} aria-label={t('prefeitura.welcome.alertsAriaLabel')}>
        <div className={styles.alertsHeader}>
          <div className={styles.alertsTitle}>{t('prefeitura.welcome.alertsTitle')}</div>
          {dash && dash.recentAlerts.length > 0 && (
            <div className={styles.alertsCount}>
              {t('prefeitura.welcome.alertsCount', { count: dash.recentAlerts.length })}
            </div>
          )}
        </div>

        {loading && <div className={styles.loading}>{t('prefeitura.common.loading')}</div>}
        {error && !loading && <div className={styles.error}>{error}</div>}
        {!loading && !error && dash && dash.recentAlerts.length === 0 && (
          <div className={styles.empty}>{t('prefeitura.welcome.alertsEmpty')}</div>
        )}
        {!loading && !error && dash && dash.recentAlerts.length > 0 && (
          <div className={styles.alertList}>
            {dash.recentAlerts.map((alert) => (
              <div key={alert.id} className={styles.alertItem}>
                <div
                  className={styles.alertDot}
                  style={{ background: alertDotColor(alert.level) }}
                />
                <div>
                  <div className={styles.alertText}>{alert.title}</div>
                  <div className={styles.alertMeta}>
                    {alert.code} · {alert.clinicName ?? t('prefeitura.welcome.alertGlobal')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function alertDotColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'critical':
      return '#e05555';
    case 'warning':
      return '#f5a623';
    case 'info':
      return '#3b8bde';
    default:
      return '#7a9090';
  }
}
