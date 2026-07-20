import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraRealtimeResponse } from '../../api/prefeituraApi';
import { BRAND } from '../../config/brand';
import { ProfessionalTypeBadge } from './ProfessionalTypeBadge';
import { formatHmsBR, formatLongDateBR } from '../../utils/dateTimeBR';
import styles from './PrefeituraTvMode.module.css';

const REFRESH_SEC = 20; // cadência do polling real (não é só cosmético)
const RING_CIRCUMFERENCE = 2 * Math.PI * 14; // r=14 (footer countdown ring)
const OCUP_CIRCUMFERENCE = 2 * Math.PI * 28; // r=28 (occupancy ring)

/**
 * Modo TV — rota fullscreen /prefeitura/tv otimizada pra display em TV/telão,
 * espelhando o mock op-tv.html: header com clock, grid 4 colunas de UPA
 * cards (semáforo, contador grande, barra de progresso, dots de médicos por
 * status, linha de alerta), footer com stats agregados + anel de countdown
 * (sincronizado com o polling real de 20s) + anel de ocupação global.
 * Auto-refresh do getRealtime a cada 20s. Botão de sair aparece só no
 * hover — não polui o display.
 */
export function PrefeituraTvMode() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<PrefeituraRealtimeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(new Date());
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_SEC);
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
          setSecondsLeft(REFRESH_SEC);
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
    dataIntervalRef.current = setInterval(fetchOnce, REFRESH_SEC * 1000);
    clockIntervalRef.current = setInterval(() => {
      setNow(new Date());
      setSecondsLeft((s) => (s <= 1 ? REFRESH_SEC : s - 1));
    }, 1000);

    return () => {
      cancelled = true;
      if (dataIntervalRef.current) clearInterval(dataIntervalRef.current);
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, [t]);

  const timeStr = formatHmsBR(now);
  const dateStr = formatLongDateBR(now);

  const ringOffset = RING_CIRCUMFERENCE * (1 - secondsLeft / REFRESH_SEC);

  const avgTarget = data && data.clinics.length > 0
    ? Math.max(1, Math.round(data.totalExpectedNow / data.clinics.filter((c) => c.expectedCount > 0).length || 1))
    : 1;
  const occupancyPct = data && data.totalExpectedNow > 0
    ? Math.round((data.totalPresentNow / data.totalExpectedNow) * 100)
    : 0;
  const occupancyOffset = OCUP_CIRCUMFERENCE * (1 - occupancyPct / 100);
  const occupancyColor = occupancyPct >= 90 ? '#4ade80' : occupancyPct >= 70 ? '#2dbfb8' : '#fbbf24';

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
        <div className={styles.tvHeaderCenter}>
          <div className={styles.tvHeaderTitle}>{t('prefeitura.tv.headerTitle')}</div>
          <div className={styles.tvHeaderSub}>{t('prefeitura.tv.headerSub')}</div>
        </div>
        <div className={styles.tvClock}>
          <div className={styles.tvTime}>{timeStr}</div>
          <div className={styles.tvDate}>{dateStr}</div>
        </div>
      </header>

      {loading && !data && (
        <div className={styles.tvLoading}>{t('prefeitura.common.loading')}</div>
      )}
      {error && !data && <div className={styles.tvError}>{error}</div>}

      {data && (
        <>
          <section className={styles.tvBody}>
            {data.clinics.map((clinic) => {
              const pct = clinic.expectedCount > 0
                ? Math.round((clinic.presentCount / clinic.expectedCount) * 100)
                : 0;
              const level = clinic.alertLevel.toLowerCase();
              return (
                <div key={clinic.clinicId} className={`${styles.upaCard} ${styles[level] ?? ''}`}>
                  <div className={styles.upaCardTop}>
                    <div>
                      <div className={styles.upaCardName}>{clinic.name}</div>
                      <div className={styles.upaCardTurno}>
                        {clinic.turnoCode && clinic.shiftStartTime && clinic.shiftEndTime
                          ? `${turnoLabel(clinic.turnoCode, t)} · ${formatHm(clinic.shiftStartTime)}–${formatHm(clinic.shiftEndTime)}`
                          : t('prefeitura.tv.noActiveShift')}
                      </div>
                      <div className={styles.statusPill}>
                        <span className={styles.statusDot} />
                        {statusLabel(level, t)}
                      </div>
                    </div>
                    <div className={styles.semaforo}>
                      <div className={styles.semaforoLight} />
                      <div className={styles.semaforoLight} />
                      <div className={styles.semaforoLight} />
                    </div>
                  </div>
                  <div className={styles.upaMeters}>
                    <div className={styles.countWrap}>
                      <div className={styles.countBig}>{clinic.presentCount}</div>
                      <div className={styles.countOf}>/ {clinic.expectedCount}</div>
                    </div>
                    <div className={styles.countLabel}>{t('prefeitura.tv.countLabel')}</div>
                    <div className={styles.progBg}>
                      <div className={styles.progFill} style={{ width: `${pct}%` }} />
                    </div>
                    {clinic.doctors.length === 0 ? (
                      <div className={styles.noShiftLabel}>{t('prefeitura.tv.noActiveShift')}</div>
                    ) : (
                      <div className={styles.medicosDots}>
                        {clinic.doctors.map((doc) => (
                          <div key={doc.userId} className={styles.medicoDotItem}>
                            <div className={`${styles.mdot} ${styles[doc.status] ?? ''}`} />
                            {doc.userName}
                            <ProfessionalTypeBadge type={doc.professionalType} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.upaAlerts}>
                    {clinic.absentCount > 0 ? (
                      <div className={`${styles.alertItem} ${styles.crit}`}>
                        ⚠ {clinic.absentUserNames.join(', ')} · {t('prefeitura.tv.alertUncoveredPositions')}
                      </div>
                    ) : clinic.lateCount > 0 ? (
                      <div className={`${styles.alertItem} ${styles.warn}`}>
                        ⚠ {clinic.lastEventUserName ?? ''} · {t('prefeitura.escalas.kpiPending')}
                      </div>
                    ) : (
                      <div className={styles.alertItem}>{checkIcon} {t('prefeitura.tv.allConfirmed')}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          <footer className={styles.tvFooter}>
            <div className={styles.footerLeft}>
              <FooterStat variant="green" value={data.totalPresentNow} label={t('prefeitura.tv.footerPresentes')} />
              <div className={styles.footerDivider} />
              <FooterStat value={data.totalExpectedNow} label={t('prefeitura.tv.footerEscalados')} />
              <div className={styles.footerDivider} />
              <FooterStat variant="yellow" value={data.totalLateNow} label={t('prefeitura.tv.footerAtrasos')} />
              <div className={styles.footerDivider} />
              <FooterStat variant="red" value={data.totalAbsentNow} label={t('prefeitura.tv.footerAusencias')} />
            </div>

            <div className={styles.footerCenter}>
              <div className={styles.ocupacaoWrap}>
                <div className={styles.ocupacaoRing}>
                  <svg width="56" height="56" viewBox="0 0 64 64">
                    <circle className={styles.oringBg} cx="32" cy="32" r="28" />
                    <circle
                      className={styles.oringFill}
                      cx="32"
                      cy="32"
                      r="28"
                      style={{
                        stroke: occupancyColor,
                        strokeDasharray: OCUP_CIRCUMFERENCE,
                        strokeDashoffset: occupancyOffset,
                      }}
                    />
                  </svg>
                  <div className={styles.ocupacaoPct} style={{ color: occupancyColor }}>{occupancyPct}%</div>
                </div>
                <div className={styles.ocupacaoInfo}>
                  <div className={styles.ocupacaoTitle}>{t('prefeitura.tv.occupancyTitle')}</div>
                  <div className={styles.ocupacaoMeta}>{t('prefeitura.tv.occupancyMeta', { target: avgTarget })}</div>
                </div>
              </div>

              <div className={styles.refreshWrap}>
                <div className={styles.refreshRing}>
                  <svg width="30" height="30" viewBox="0 0 32 32">
                    <circle className={styles.ringBg} cx="16" cy="16" r="14" />
                    <circle
                      className={styles.ringFill}
                      cx="16"
                      cy="16"
                      r="14"
                      style={{ strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: ringOffset }}
                    />
                  </svg>
                </div>
                <div>
                  <div className={styles.refreshLabel}>{t('prefeitura.tv.nextUpdateIn')}</div>
                  <div className={styles.refreshCountdown}>{secondsLeft}s</div>
                </div>
              </div>
            </div>

            <div className={styles.footerRight}>
              <div className={styles.liveBadge}>
                <div className={styles.liveDot} />
                {t('prefeitura.tv.live')}
              </div>
              {t('prefeitura.tv.autoUpdating')}
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

function FooterStat({ value, label, variant }: { value: number; label: string; variant?: 'green' | 'yellow' | 'red' }) {
  return (
    <div className={styles.footerStat}>
      <div className={`${styles.footerStatNum} ${variant ? styles[variant] : ''}`}>{value}</div>
      <div className={styles.footerStatLabel} dangerouslySetInnerHTML={{ __html: label }} />
    </div>
  );
}

const checkIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle' }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function statusLabel(level: string, t: (key: string) => string): string {
  if (level === 'green') return t('prefeitura.tv.statusComplete');
  if (level === 'yellow') return t('prefeitura.tv.statusPartial');
  return t('prefeitura.tv.statusCritical');
}

function turnoLabel(turno: string, t: (key: string) => string): string {
  if (turno === 'manha') return t('prefeitura.tv.turnoManha');
  if (turno === 'tarde') return t('prefeitura.tv.turnoTarde');
  return t('prefeitura.tv.turnoNoite');
}

/** Formata TimeSpan serializado pelo backend ("HH:mm:ss") pra "HHhmm". */
function formatHm(timeSpan: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeSpan);
  return match ? `${match[1].padStart(2, '0')}h${match[2]}` : timeSpan;
}
