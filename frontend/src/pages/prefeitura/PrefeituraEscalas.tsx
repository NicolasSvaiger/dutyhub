import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  prefeituraApi,
  type PrefeituraClinicItem,
  type PrefeituraWeeklyScheduleResponse,
} from '../../api/prefeituraApi';
import { ProfessionalTypeBadge } from './ProfessionalTypeBadge';
import styles from './PrefeituraEscalas.module.css';

const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Sub-view "Escalas" do portal Prefeitura — mock op-escalas.html. Seletor
 * de UPA + navegação de semana (offset em memória, sem persistir na URL)
 * + KPIs da semana + alertas + grade UPA x dia x turno com chips de médico
 * (confirmado/pendente) e células "sem cobertura" quando a meta de
 * DoctorsPerShift não é atingida. Somente visualização — sem mutação.
 */
export function PrefeituraEscalas() {
  const { t } = useTranslation();
  const [clinics, setClinics] = useState<PrefeituraClinicItem[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [data, setData] = useState<PrefeituraWeeklyScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    prefeituraApi
      .getClinics()
      .then((list) => {
        setClinics(list);
        if (list.length > 0) setSelectedClinicId(list[0].clinicId);
      })
      .catch(() => {
        /* silent — sem clínicas no escopo é um estado válido (empty state cobre) */
      });
  }, []);

  useEffect(() => {
    if (!selectedClinicId) return;
    fetchData(selectedClinicId, weekOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClinicId, weekOffset]);

  async function fetchData(clinicId: string, offset: number) {
    setLoading(true);
    setError(null);
    try {
      const anchor = new Date(today);
      anchor.setDate(anchor.getDate() + offset * 7);
      const result = await prefeituraApi.getWeeklySchedule(clinicId, anchor.toISOString().slice(0, 10));
      setData(result);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      setError(
        raw.includes('NO_ORGAN_CONTEXT')
          ? t('prefeitura.errors.noOrgan')
          : t('prefeitura.errors.generic'),
      );
    } finally {
      setLoading(false);
    }
  }

  const weekTitle = useMemo(() => {
    if (!data) return '—';
    const ini = new Date(data.weekStart);
    const fim = new Date(data.weekEnd);
    const iniStr = `${ini.getUTCDate()} de ${MESES_PT[ini.getUTCMonth()]}`;
    const fimStr = `${fim.getUTCDate()} de ${MESES_PT[fim.getUTCMonth()]} de ${fim.getUTCFullYear()}`;
    return `${iniStr} – ${fimStr}`;
  }, [data]);

  const weekSub = weekOffset === 0
    ? t('prefeitura.escalas.currentWeek')
    : weekOffset > 0
      ? t('prefeitura.escalas.weeksAhead', { count: weekOffset })
      : t('prefeitura.escalas.weeksBehind', { count: Math.abs(weekOffset) });

  return (
    <div className={styles.container}>
      <div className={styles.readOnlyBadge}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {t('prefeitura.escalas.readOnlyBadge')}
      </div>

      {/* ── Seletor de UPA ── */}
      <div className={styles.upaSelector}>
        {clinics.map((c) => (
          <button
            key={c.clinicId}
            type="button"
            className={`${styles.upaOpt} ${selectedClinicId === c.clinicId ? styles.selected : ''}`}
            onClick={() => setSelectedClinicId(c.clinicId)}
          >
            <div className={styles.upaOptIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className={styles.upaOptName}>{c.name}</div>
          </button>
        ))}
      </div>

      {clinics.length === 0 && !loading && (
        <div className={styles.empty}>{t('prefeitura.escalas.selectClinicFirst')}</div>
      )}

      {selectedClinicId && (
        <>
          {/* ── Navegação de semana ── */}
          <div className={styles.weekNav}>
            <div className={styles.weekNavLeft}>
              <button type="button" className={styles.weekBtn} onClick={() => setWeekOffset((o) => o - 1)} aria-label={t('prefeitura.escalas.weekPrev')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div>
                <div className={styles.weekTitle}>{weekTitle}</div>
                <div className={styles.weekSub}>{weekSub}</div>
              </div>
              <button type="button" className={styles.weekBtn} onClick={() => setWeekOffset((o) => o + 1)} aria-label={t('prefeitura.escalas.weekNext')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button type="button" className={styles.weekToday} onClick={() => setWeekOffset(0)}>
                {t('prefeitura.escalas.goToday')}
              </button>
            </div>
            <div className={styles.legend}>
              <div className={styles.legItem}><div className={styles.legDot} style={{ background: '#22c55e' }} />{t('prefeitura.escalas.legendConfirmed')}</div>
              <div className={styles.legItem}><div className={styles.legDot} style={{ background: '#f59e0b' }} />{t('prefeitura.escalas.legendPending')}</div>
              <div className={styles.legItem}><div className={styles.legDot} style={{ background: '#ef4444' }} />{t('prefeitura.escalas.legendUncovered')}</div>
              <div className={styles.legItem}><div className={styles.legDot} style={{ background: '#3b82f6' }} />{t('prefeitura.escalas.legendToday')}</div>
            </div>
          </div>

          {loading && !data && <div className={styles.loading}>{t('prefeitura.common.loading')}</div>}
          {error && <div className={styles.error}>{error}</div>}

          {data && (
            <>
              {/* ── KPIs ── */}
              <section className={styles.kpiStrip}>
                <KpiS icon={shiftIcon} bg="#e8faf9" fg="#2dbfb8" val={data.totalShiftSlots} lbl={t('prefeitura.escalas.kpiShifts')} />
                <KpiS icon={checkIcon} bg="#dcfce7" fg="#22c55e" val={data.totalConfirmed} lbl={t('prefeitura.escalas.kpiConfirmed')} />
                <KpiS icon={clockIcon} bg="#fef3c7" fg="#f59e0b" val={data.totalPending} lbl={t('prefeitura.escalas.kpiPending')} />
                <KpiS icon={xIcon} bg="#fee2e2" fg="#ef4444" val={data.totalUncovered} lbl={t('prefeitura.escalas.kpiUncovered')} />
                <KpiS icon={usersIcon} bg="#ede9fe" fg="#8b5cf6" val={data.totalDoctors} lbl={t('prefeitura.escalas.kpiDoctors')} />
              </section>

              {/* ── Alertas ── */}
              <div className={styles.alertasWrap}>
                {data.totalUncovered > 0 && (
                  <div className={`${styles.alertaItem} ${styles.danger}`}>
                    <div className={styles.alertaIcon}>{xIcon}</div>
                    <div className={styles.alertaText}>
                      {t('prefeitura.escalas.alertUncovered', { count: data.totalUncovered, clinic: data.clinicName })}
                    </div>
                  </div>
                )}
                {data.totalPending > 0 && (
                  <div className={`${styles.alertaItem} ${styles.warn}`}>
                    <div className={styles.alertaIcon}>{clockIcon}</div>
                    <div className={styles.alertaText}>
                      {t('prefeitura.escalas.alertPending', { count: data.totalPending })}
                    </div>
                  </div>
                )}
                {data.totalUncovered === 0 && data.totalPending === 0 && (
                  <div className={`${styles.alertaItem} ${styles.info}`}>
                    <div className={styles.alertaIcon}>{checkIcon}</div>
                    <div className={styles.alertaText}>
                      {t('prefeitura.escalas.alertAllGood', { clinic: data.clinicName })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Grade semanal ── */}
              <div className={styles.gradeWrap}>
                <div className={styles.gradeScroll}>
                  <table className={styles.gradeTable}>
                    <thead>
                      <tr>
                        <th />
                        {data.days.map((dayIso) => {
                          const d = new Date(dayIso);
                          const isHoje = d.getTime() === today.getTime();
                          return (
                            <th key={dayIso} className={isHoje ? styles.thHoje : ''}>
                              <span className={styles.dayNum}>{d.getUTCDate()}</span>
                              <span className={styles.dayNameSm}>{DIAS_PT[d.getUTCDay()]}</span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#7a9090', fontWeight: 700 }}>
                            {t('prefeitura.escalas.empty')}
                          </td>
                        </tr>
                      ) : (
                        data.rows.map((row) => (
                          <tr key={row.turno}>
                            <td>
                              <div className={styles.turnoLabel}>{turnoLabel(row.turno, t)}</div>
                              <span className={styles.turnoHorario}>
                                {formatTime(row.startTime)}–{formatTime(row.endTime)}
                              </span>
                            </td>
                            {row.cells.map((cell) => {
                              const d = new Date(cell.date);
                              const isHoje = d.getTime() === today.getTime();
                              return (
                                <td key={cell.date} className={isHoje ? styles.tdToday : ''}>
                                  {cell.assignments.length === 0 && cell.uncoveredCount === 0 ? (
                                    <div className={styles.cellEmpty} />
                                  ) : cell.assignments.length === 0 ? (
                                    <div className={styles.cellAlert}>
                                      {xIcon}
                                      {t('prefeitura.escalas.noCoverage')}
                                    </div>
                                  ) : (
                                    <div className={styles.cell}>
                                      {cell.assignments.map((a) => (
                                        <div
                                          key={a.userId}
                                          className={`${styles.medChip} ${styles[a.status]}`}
                                          title={a.professionalType ? `${a.userName} · ${a.professionalType}` : a.userName}
                                        >
                                          <div className={styles.medDot} />
                                          <span className={styles.medNome}>
                                            {firstName(a.userName)}
                                          </span>
                                          <ProfessionalTypeBadge type={a.professionalType} />
                                        </div>
                                      ))}
                                      {cell.uncoveredCount > 0 && (
                                        <div className={`${styles.medChip} ${styles.pendente}`} style={{ background: '#fee2e2', color: '#991b1b' }}>
                                          <div className={styles.medDot} style={{ background: '#ef4444' }} />
                                          <span className={styles.medNome}>{t('prefeitura.escalas.openSlot')}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function KpiS({ icon, bg, fg, val, lbl }: { icon: ReactNode; bg: string; fg: string; val: number; lbl: string }) {
  return (
    <div className={styles.kpiS}>
      <div className={styles.kpiSIcon} style={{ background: bg, color: fg }}>
        {icon}
      </div>
      <div>
        <div className={styles.kpiSVal} style={{ color: fg }}>{val}</div>
        <div className={styles.kpiSLbl}>{lbl}</div>
      </div>
    </div>
  );
}

const shiftIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const checkIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const clockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const xIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);
const usersIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

function turnoLabel(turno: string, t: (key: string) => string): string {
  if (turno === 'manha') return t('prefeitura.escalas.turnoManha');
  if (turno === 'tarde') return t('prefeitura.escalas.turnoTarde');
  return t('prefeitura.escalas.turnoNoite');
}

function firstName(name: string): string {
  return name.split(' ').slice(0, 2).join(' ');
}

/** Formata TimeSpan serializado pelo backend ("HH:mm:ss") pra "HHh". */
function formatTime(timeSpan: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeSpan);
  return match ? `${match[1].padStart(2, '0')}h` : timeSpan;
}
