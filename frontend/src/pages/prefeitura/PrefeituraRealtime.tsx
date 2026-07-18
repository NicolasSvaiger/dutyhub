import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraRealtimeResponse } from '../../api/prefeituraApi';
import styles from './PrefeituraRealtime.module.css';

/**
 * Sub-view "Tempo Real" do portal Prefeitura. Chama getRealtime no mount e
 * a cada 30s (setInterval + cleanup no unmount). Mostra totalizadores no
 * topo + grid de cards de UPAs colorizados por alertLevel (green/yellow/red)
 * com nomes dos ausentes. Timestamp asOf visível pro gestor saber a
 * frescor dos dados.
 */
export function PrefeituraRealtime() {
  const { t } = useTranslation();
  const [data, setData] = useState<PrefeituraRealtimeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      try {
        const result = await prefeituraApi.getRealtime();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : '';
        setError(
          raw.includes('NO_ORGAN_CONTEXT')
            ? t('prefeitura.errors.noOrgan')
            : t('prefeitura.errors.generic'),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOnce();
    // Poll a cada 30s enquanto a view estiver montada
    intervalRef.current = setInterval(fetchOnce, 30_000);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [t]);

  if (loading && !data) {
    return <div className={styles.loading}>{t('prefeitura.common.loading')}</div>;
  }
  if (error && !data) {
    return <div className={styles.error}>{error}</div>;
  }
  if (!data) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>{t('prefeitura.realtime.title')}</div>
        <div className={styles.timestamp}>
          <span className={styles.pulseDot} />
          {t('prefeitura.realtime.updatedAt', { time: formatTime(data.asOf) })}
        </div>
      </div>

      {/* Totalizadores */}
      <section className={styles.totalGrid} aria-label={t('prefeitura.realtime.totalsAria')}>
        <div className={styles.totalCard}>
          <div className={styles.totalLabel}>{t('prefeitura.realtime.totalClinics')}</div>
          <div className={styles.totalValue}>{data.totalClinics}</div>
        </div>
        <div className={styles.totalCard}>
          <div className={styles.totalLabel}>{t('prefeitura.realtime.expectedNow')}</div>
          <div className={styles.totalValue}>{data.totalExpectedNow}</div>
        </div>
        <div className={styles.totalCard}>
          <div className={styles.totalLabel}>{t('prefeitura.realtime.presentNow')}</div>
          <div className={styles.totalValue}>{data.totalPresentNow}</div>
        </div>
        <div className={styles.totalCard}>
          <div className={styles.totalLabel}>{t('prefeitura.realtime.absentNow')}</div>
          <div className={`${styles.totalValue} ${data.totalAbsentNow > 0 ? styles.bad : ''}`}>
            {data.totalAbsentNow}
          </div>
        </div>
      </section>

      {/* Grid de clínicas */}
      {data.clinics.length === 0 ? (
        <div className={styles.empty}>{t('prefeitura.realtime.emptyClinics')}</div>
      ) : (
        <section className={styles.clinicGrid} aria-label={t('prefeitura.realtime.clinicsAria')}>
          {data.clinics.map((clinic) => (
            <div
              key={clinic.clinicId}
              className={`${styles.clinicCard} ${styles[clinic.alertLevel.toLowerCase()] ?? ''}`}
            >
              <div className={styles.clinicName}>{clinic.name}</div>
              <div className={styles.clinicStats}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t('prefeitura.realtime.expected')}</span>
                  <span className={styles.statValue}>{clinic.expectedCount}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t('prefeitura.realtime.present')}</span>
                  <span className={`${styles.statValue} ${styles.present}`}>{clinic.presentCount}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t('prefeitura.realtime.absent')}</span>
                  <span className={`${styles.statValue} ${styles.absent}`}>{clinic.absentCount}</span>
                </div>
              </div>
              {clinic.absentUserNames.length > 0 && (
                <div className={styles.absentList}>
                  {clinic.absentUserNames.map((name) => (
                    <span key={name} className={styles.absentName}>
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}
