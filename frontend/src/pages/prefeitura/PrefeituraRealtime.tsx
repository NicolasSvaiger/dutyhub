import { useEffect, useState, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraRealtimeResponse } from '../../api/prefeituraApi';
import { ProfessionalTypeBadge } from './ProfessionalTypeBadge';
import styles from './PrefeituraRealtime.module.css';

/**
 * Sub-view "Tempo Real" do portal Prefeitura — mock op-realtime.html.
 * Chama getRealtime no mount e a cada 30s (setInterval + cleanup no
 * unmount). Layout: 4 KPIs (UPAs/presentes/atrasos/ausências) + grid de
 * cards de UPA (semáforo, barra de progresso, lista de médicos por status
 * granular, último evento) + feed de "Eventos Recentes" (check-in/atraso/
 * check-out/ausência) reaproveitando o mesmo response do backend.
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

      {/* KPIs */}
      <section className={styles.kpiGrid} aria-label={t('prefeitura.realtime.totalsAria')}>
        <KpiCard
          variant="teal"
          value={data.totalClinics}
          label={t('prefeitura.realtime.kpiTotalUpas')}
          sub={t('prefeitura.realtime.kpiTotalUpasSub')}
        />
        <KpiCard
          variant="green"
          value={data.totalPresentNow}
          label={t('prefeitura.realtime.kpiPresentes')}
          sub={t('prefeitura.realtime.kpiPresentesSub', { expected: data.totalExpectedNow })}
        />
        <KpiCard
          variant="yellow"
          value={data.totalLateNow}
          label={t('prefeitura.realtime.kpiAtrasos')}
          sub={t('prefeitura.realtime.kpiAtrasosSub')}
        />
        <KpiCard
          variant="red"
          value={data.totalAbsentNow}
          label={t('prefeitura.realtime.kpiAusencias')}
          sub={t('prefeitura.realtime.kpiAusenciasSub')}
        />
      </section>

      {/* Status das Unidades */}
      <div className={styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle}>{t('prefeitura.realtime.unitsTitle')}</div>
          <div className={styles.sectionSub}>{t('prefeitura.realtime.unitsSub')}</div>
        </div>
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <div className={styles.legendDot} style={{ background: '#22c55e' }} />
            {t('prefeitura.realtime.legendComplete')}
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendDot} style={{ background: '#f59e0b' }} />
            {t('prefeitura.realtime.legendPartial')}
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendDot} style={{ background: '#ef4444' }} />
            {t('prefeitura.realtime.legendCritical')}
          </div>
        </div>
      </div>

      {data.clinics.length === 0 ? (
        <div className={styles.empty}>{t('prefeitura.realtime.emptyClinics')}</div>
      ) : (
        <section className={styles.upaGrid} aria-label={t('prefeitura.realtime.clinicsAria')}>
          {data.clinics.map((clinic) => {
            const pct = clinic.expectedCount > 0
              ? Math.round((clinic.presentCount / clinic.expectedCount) * 100)
              : 0;
            const level = clinic.alertLevel.toLowerCase();
            return (
              <div key={clinic.clinicId} className={`${styles.upaCard} ${styles[level] ?? ''}`}>
                <div className={styles.upaCardHeader}>
                  <div className={styles.upaHeaderLeft}>
                    <div className={styles.semaforo}>
                      <div className={styles.semaforoLight} />
                      <div className={styles.semaforoLight} />
                      <div className={styles.semaforoLight} />
                    </div>
                    <div>
                      <div className={styles.upaName}>{clinic.name}</div>
                      <div className={styles.upaTurno}>
                        {clinic.turnoCode && clinic.shiftStartTime && clinic.shiftEndTime
                          ? `${turnoLabel(clinic.turnoCode, t)} · ${formatHm(clinic.shiftStartTime)}–${formatHm(clinic.shiftEndTime)}`
                          : t('prefeitura.realtime.noActiveShift')}
                      </div>
                    </div>
                  </div>
                  <div className={styles.statusPill}>{statusLabel(level, t)}</div>
                </div>
                <div className={styles.upaCardBody}>
                  <div className={styles.progRow}>
                    <span className={styles.progLabel}>{t('prefeitura.realtime.doctorsPresentLabel')}</span>
                    <span className={styles.progCount}>{clinic.presentCount} / {clinic.expectedCount}</span>
                  </div>
                  <div className={styles.progBarBg}>
                    <div className={styles.progBarFill} style={{ width: `${pct}%` }} />
                  </div>
                  {clinic.doctors.length === 0 ? (
                    <div className={styles.noShift}>{t('prefeitura.realtime.noActiveShift')}</div>
                  ) : (
                    <div className={styles.medicosList}>
                      {clinic.doctors.map((doc) => (
                        <div key={doc.userId} className={styles.medicoItem}>
                          <div className={styles.medicoLeft}>
                            <div className={`${styles.medicoDot} ${styles[doc.status] ?? ''}`} />
                            <div>
                              <span className={styles.medicoName}>{doc.userName}</span>
                              <ProfessionalTypeBadge type={doc.professionalType} />
                              {doc.registrationNumber && (
                                <span className={styles.medicoCrm}> · CRM {doc.registrationNumber}</span>
                              )}
                            </div>
                          </div>
                          <span className={`${styles.medicoBadge} ${styles[doc.status] ?? ''}`}>
                            {doctorStatusLabel(doc.status, t)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {clinic.lastEventUserName && (
                    <div className={styles.upaLastEvent}>
                      {clockIcon}
                      {clinic.lastEventType === 'absence'
                        ? t('prefeitura.realtime.lastEventAbsence', { name: clinic.lastEventUserName })
                        : t('prefeitura.realtime.lastEventCheckin', {
                            name: clinic.lastEventUserName,
                            time: clinic.lastEventTime ? formatTime(clinic.lastEventTime) : '',
                          })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Eventos Recentes */}
      <div className={styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle}>{t('prefeitura.realtime.eventsTitle')}</div>
          <div className={styles.sectionSub}>{t('prefeitura.realtime.eventsSub')}</div>
        </div>
      </div>
      <div className={styles.eventsCard}>
        <div className={styles.eventsHeader}>
          <div className={styles.eventsTitle}>{t('prefeitura.realtime.eventsFeedTitle')}</div>
        </div>
        <div className={styles.eventsList}>
          {data.recentEvents.length === 0 ? (
            <div className={styles.noShift} style={{ padding: '1rem 1.4rem' }}>
              {t('prefeitura.realtime.eventsEmpty')}
            </div>
          ) : (
            data.recentEvents.map((ev, idx) => (
              <div key={`${ev.userId ?? 'x'}-${ev.timestamp}-${idx}`} className={styles.eventItem}>
                <div className={`${styles.eventIcon} ${styles[ev.type] ?? ''}`}>{eventIcon(ev.type)}</div>
                <div className={styles.eventBody}>
                  <div className={styles.eventName}>{ev.userName ?? '—'}</div>
                  <div className={styles.eventDesc}>
                    {eventDescription(ev, t)}
                    {ev.clinicName ? ` · ${ev.clinicName}` : ''}
                  </div>
                </div>
                <div className={styles.eventTime}>{formatTime(ev.timestamp)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  variant,
  value,
  label,
  sub,
}: {
  variant: 'teal' | 'green' | 'yellow' | 'red';
  value: number;
  label: string;
  sub: string;
}) {
  return (
    <div className={`${styles.kpiCard} ${styles[variant]}`}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiSub}>{sub}</div>
    </div>
  );
}

const clockIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

function eventIcon(type: string): ReactNode {
  switch (type) {
    case 'checkin':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'checkout':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
    case 'late':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
  }
}

function eventDescription(
  ev: { type: string; minutesLate?: number | null },
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  switch (ev.type) {
    case 'checkin':
      return t('prefeitura.realtime.eventCheckin');
    case 'checkout':
      return t('prefeitura.realtime.eventCheckout');
    case 'late':
      return t('prefeitura.realtime.eventLate', { minutes: ev.minutesLate ?? 0 });
    default:
      return t('prefeitura.realtime.eventAbsence');
  }
}

function statusLabel(level: string, t: (key: string) => string): string {
  if (level === 'green') return t('prefeitura.realtime.statusComplete');
  if (level === 'yellow') return t('prefeitura.realtime.statusPartial');
  return t('prefeitura.realtime.statusCritical');
}

function doctorStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'present': return t('prefeitura.realtime.doctorStatusPresent');
    case 'late': return t('prefeitura.realtime.doctorStatusLate');
    case 'absent': return t('prefeitura.realtime.doctorStatusAbsent');
    default: return t('prefeitura.realtime.doctorStatusUpcoming');
  }
}

function turnoLabel(turno: string, t: (key: string) => string): string {
  if (turno === 'manha') return t('prefeitura.escalas.turnoManha');
  if (turno === 'tarde') return t('prefeitura.escalas.turnoTarde');
  return t('prefeitura.escalas.turnoNoite');
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

/** Formata TimeSpan serializado pelo backend ("HH:mm:ss") pra "HHhmm". */
function formatHm(timeSpan: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeSpan);
  return match ? `${match[1].padStart(2, '0')}h${match[2]}` : timeSpan;
}
