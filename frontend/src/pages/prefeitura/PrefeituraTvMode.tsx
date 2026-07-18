import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraRealtimeResponse } from '../../api/prefeituraApi';
import { BRAND } from '../../config/brand';
import styles from './PrefeituraTvMode.module.css';

/**
 * Modo TV — rota fullscreen /prefeitura/tv otimizada pra display em TV/telão.
 * Auto-refresh do getRealtime a cada 20s (mais agressivo que a view Realtime
 * porque o telão precisa estar sempre fresco). Fontes gigantes, cores fortes
 * por alertLevel. Relógio wall-clock atualizado a cada segundo.
 * Botão de sair aparece só no hover — não polui o display.
 */
export function PrefeituraTvMode() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<PrefeituraRealtimeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(new Date());
  const dataIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    dataIntervalRef.current = setInterval(fetchOnce, 20_000);
    clockIntervalRef.current = setInterval(() => setNow(new Date()), 1000);

    return () => {
      cancelled = true;
      if (dataIntervalRef.current) clearInterval(dataIntervalRef.current);
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, [t]);

  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className={styles.tvRoot}>
      <button
        type="button"
        className={styles.tvExit}
        onClick={() => navigate('/prefeitura', { replace: true })}
        aria-label={t('prefeitura.tv.exit')}
      >
        ✕ {t('prefeitura.tv.exit')}
      </button>

      <header className={styles.tvHeader}>
        <div className={styles.tvBrand}>
          <div>
            <div className={styles.tvBrandName}>{BRAND.name}</div>
            <div className={styles.tvBrandTag}>{t('prefeitura.tv.tagline')}</div>
          </div>
        </div>
        <div className={styles.tvClock}>
          <div className={styles.tvTime}>{timeStr}</div>
          <div className={styles.tvDate}>{dateStr}</div>
          {data && (
            <div className={styles.tvUpdatedBadge}>
              <span className={styles.tvPulseDot} />
              {t('prefeitura.tv.updated', { time: formatShortTime(data.asOf) })}
            </div>
          )}
        </div>
      </header>

      {loading && !data && (
        <div className={styles.tvLoading}>{t('prefeitura.common.loading')}</div>
      )}
      {error && !data && <div className={styles.tvError}>{error}</div>}

      {data && (
        <>
          <section className={styles.tvTotals}>
            <div className={styles.tvTotal}>
              <div className={styles.tvTotalLabel}>{t('prefeitura.tv.totalClinics')}</div>
              <div className={styles.tvTotalValue}>{data.totalClinics}</div>
            </div>
            <div className={styles.tvTotal}>
              <div className={styles.tvTotalLabel}>{t('prefeitura.tv.expected')}</div>
              <div className={styles.tvTotalValue}>{data.totalExpectedNow}</div>
            </div>
            <div className={styles.tvTotal}>
              <div className={styles.tvTotalLabel}>{t('prefeitura.tv.present')}</div>
              <div className={styles.tvTotalValue}>{data.totalPresentNow}</div>
            </div>
            <div className={styles.tvTotal}>
              <div className={styles.tvTotalLabel}>{t('prefeitura.tv.absent')}</div>
              <div className={`${styles.tvTotalValue} ${data.totalAbsentNow > 0 ? styles.bad : ''}`}>
                {data.totalAbsentNow}
              </div>
            </div>
          </section>

          <section className={styles.tvClinics}>
            {data.clinics.map((clinic) => (
              <div
                key={clinic.clinicId}
                className={`${styles.tvClinic} ${styles[clinic.alertLevel.toLowerCase()] ?? ''}`}
              >
                <div className={styles.tvClinicName}>{clinic.name}</div>
                <div className={styles.tvClinicStats}>
                  <div className={styles.tvStat}>
                    <span className={styles.tvStatLabel}>{t('prefeitura.tv.statExpected')}</span>
                    <span className={styles.tvStatValue}>{clinic.expectedCount}</span>
                  </div>
                  <div className={styles.tvStat}>
                    <span className={styles.tvStatLabel}>{t('prefeitura.tv.statPresent')}</span>
                    <span className={`${styles.tvStatValue} ${styles.present}`}>{clinic.presentCount}</span>
                  </div>
                  <div className={styles.tvStat}>
                    <span className={styles.tvStatLabel}>{t('prefeitura.tv.statAbsent')}</span>
                    <span className={`${styles.tvStatValue} ${styles.absent}`}>{clinic.absentCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}
