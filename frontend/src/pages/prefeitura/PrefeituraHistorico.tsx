import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  prefeituraApi,
  type PrefeituraClinicItem,
  type PrefeituraUnitTimelineItem,
  type PrefeituraUnitTimelineResponse,
} from '../../api/prefeituraApi';
import { ProfessionalTypeBadge } from './ProfessionalTypeBadge';
import { formatHmBR, formatShortDateBR } from '../../utils/dateTimeBR';
import styles from './PrefeituraHistorico.module.css';

type ViewMode = 'timeline' | 'tabela';
type EventoFilter = '' | 'in' | 'late' | 'absent';
type TurnoFilter = '' | 'manha' | 'tarde' | 'noite';

/**
 * Sub-view "Unidades (UPAs)" do portal Prefeitura — mock op-historico.html.
 * Seletor de UPA em cards (uma por vez, como no mock) + filtros de
 * período/turno/evento + toggle timeline/tabela + KPIs + timeline agrupada
 * por dia + tabela detalhada. Diferente do antigo PrefeituraHistorico
 * (timeline heterogênea de eventos admin), esta tela foca só nos plantões
 * de UMA UPA, com granularidade de check-in/check-out/atraso/ausência.
 */
export function PrefeituraHistorico() {
  const { t } = useTranslation();
  const [clinics, setClinics] = useState<PrefeituraClinicItem[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [data, setData] = useState<PrefeituraUnitTimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [turno, setTurno] = useState<TurnoFilter>('');
  const [evento, setEvento] = useState<EventoFilter>('');
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

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
    fetchData(selectedClinicId, from, to, turno);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClinicId]);

  async function fetchData(clinicId: string, f: string, tParam: string, tn: TurnoFilter) {
    setLoading(true);
    setError(null);
    try {
      const result = await prefeituraApi.getUnitTimeline(clinicId, f, tParam, tn || undefined);
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

  function handleSelectClinic(clinicId: string) {
    setSelectedClinicId(clinicId);
  }

  function handleFilterChange(nextFrom: string, nextTo: string, nextTurno: TurnoFilter) {
    setFrom(nextFrom);
    setTo(nextTo);
    setTurno(nextTurno);
    if (selectedClinicId) fetchData(selectedClinicId, nextFrom, nextTo, nextTurno);
  }

  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (!evento) return data.items;
    return data.items.filter((i) => i.type === evento);
  }, [data, evento]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, PrefeituraUnitTimelineItem[]>();
    for (const item of filteredItems) {
      const key = item.date.slice(0, 10);
      const existing = map.get(key);
      if (existing) existing.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredItems]);

  return (
    <div className={styles.container}>
      {/* ── Seletor de UPA ── */}
      <div className={styles.upaSelector}>
        {clinics.map((c) => (
          <button
            key={c.clinicId}
            type="button"
            className={`${styles.upaOpt} ${selectedClinicId === c.clinicId ? styles.selected : ''}`}
            onClick={() => handleSelectClinic(c.clinicId)}
          >
            <div className={styles.upaOptIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </div>
            <div>
              <div className={styles.upaOptName}>{c.name}</div>
            </div>
          </button>
        ))}
      </div>

      {clinics.length === 0 && !loading && (
        <div className={styles.empty}>{t('prefeitura.historico.selectClinicFirst')}</div>
      )}

      {selectedClinicId && (
        <>
          {/* ── Filtros + toggle ── */}
          <div className={styles.filters}>
            <div className={styles.filterGroup}>
              <label htmlFor="hist-from" className={styles.filterLabel}>
                {t('prefeitura.historico.from')}
              </label>
              <input
                id="hist-from"
                type="date"
                className={styles.filterInput}
                value={from}
                onChange={(e) => handleFilterChange(e.target.value, to, turno)}
              />
            </div>
            <div className={styles.filterGroup}>
              <label htmlFor="hist-to" className={styles.filterLabel}>
                {t('prefeitura.historico.to')}
              </label>
              <input
                id="hist-to"
                type="date"
                className={styles.filterInput}
                value={to}
                onChange={(e) => handleFilterChange(from, e.target.value, turno)}
              />
            </div>
            <div className={styles.filterGroup}>
              <label htmlFor="hist-turno" className={styles.filterLabel}>
                {t('prefeitura.historico.turno')}
              </label>
              <select
                id="hist-turno"
                className={styles.filterSelect}
                value={turno}
                onChange={(e) => handleFilterChange(from, to, e.target.value as TurnoFilter)}
              >
                <option value="">{t('prefeitura.historico.allTurnos')}</option>
                <option value="manha">{t('prefeitura.historico.turnoManha')}</option>
                <option value="tarde">{t('prefeitura.historico.turnoTarde')}</option>
                <option value="noite">{t('prefeitura.historico.turnoNoite')}</option>
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label htmlFor="hist-evento" className={styles.filterLabel}>
                {t('prefeitura.historico.evento')}
              </label>
              <select
                id="hist-evento"
                className={styles.filterSelect}
                value={evento}
                onChange={(e) => setEvento(e.target.value as EventoFilter)}
              >
                <option value="">{t('prefeitura.historico.allEventos')}</option>
                <option value="in">{t('prefeitura.historico.eventoIn')}</option>
                <option value="late">{t('prefeitura.historico.eventoLate')}</option>
                <option value="absent">{t('prefeitura.historico.eventoAbsent')}</option>
              </select>
            </div>
            <div className={styles.viewToggle}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${viewMode === 'timeline' ? styles.active : ''}`}
                onClick={() => setViewMode('timeline')}
              >
                {t('prefeitura.historico.viewTimeline')}
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${viewMode === 'tabela' ? styles.active : ''}`}
                onClick={() => setViewMode('tabela')}
              >
                {t('prefeitura.historico.viewTable')}
              </button>
            </div>
          </div>

          {loading && !data && <div className={styles.loading}>{t('prefeitura.common.loading')}</div>}
          {error && <div className={styles.error}>{error}</div>}

          {data && (
            <>
              {/* ── KPIs ── */}
              <section className={styles.kpiGrid}>
                <div className={`${styles.kpiCard} ${styles.teal}`}>
                  <div className={styles.kpiLbl}>{t('prefeitura.historico.kpiTotal')}</div>
                  <div className={styles.kpiVal}>{data.totalShifts}</div>
                  <div className={styles.kpiSub}>{t('prefeitura.historico.kpiTotalSub')}</div>
                </div>
                <div className={`${styles.kpiCard} ${styles.green}`}>
                  <div className={styles.kpiLbl}>{t('prefeitura.historico.kpiEntradas')}</div>
                  <div className={styles.kpiVal}>{data.entradas}</div>
                  <div className={styles.kpiSub}>{t('prefeitura.historico.kpiEntradasSub')}</div>
                </div>
                <div className={`${styles.kpiCard} ${styles.purple}`}>
                  <div className={styles.kpiLbl}>{t('prefeitura.historico.kpiSaidas')}</div>
                  <div className={styles.kpiVal}>{data.saidas}</div>
                  <div className={styles.kpiSub}>{t('prefeitura.historico.kpiSaidasSub')}</div>
                </div>
                <div className={`${styles.kpiCard} ${styles.yellow}`}>
                  <div className={styles.kpiLbl}>{t('prefeitura.historico.kpiAtrasos')}</div>
                  <div className={styles.kpiVal}>{data.atrasos}</div>
                  <div className={styles.kpiSub}>{t('prefeitura.historico.kpiAtrasosSub')}</div>
                </div>
                <div className={`${styles.kpiCard} ${styles.red}`}>
                  <div className={styles.kpiLbl}>{t('prefeitura.historico.kpiAusencias')}</div>
                  <div className={styles.kpiVal}>{data.ausencias}</div>
                  <div className={styles.kpiSub}>{t('prefeitura.historico.kpiAusenciasSub')}</div>
                </div>
              </section>

              {filteredItems.length === 0 ? (
                <div className={styles.empty}>{t('prefeitura.historico.empty')}</div>
              ) : viewMode === 'timeline' ? (
                <div>
                  {groupedByDay.map(([date, items]) => (
                    <DayBlock key={date} date={date} items={items} t={t} />
                  ))}
                </div>
              ) : (
                <section className={styles.tableWrap}>
                  <div className={styles.tableHeader}>
                    <div className={styles.tableTitle}>
                      {t('prefeitura.historico.tableTitle')} · {data.clinicName}
                    </div>
                  </div>
                  <div className={styles.tableScroll}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t('prefeitura.historico.colDoctor')}</th>
                          <th>{t('prefeitura.historico.colDate')}</th>
                          <th>{t('prefeitura.historico.colTurno')}</th>
                          <th className={styles.center}>{t('prefeitura.historico.colExpected')}</th>
                          <th className={styles.center}>{t('prefeitura.historico.colCheckin')}</th>
                          <th className={styles.center}>{t('prefeitura.historico.colCheckout')}</th>
                          <th className={styles.center}>{t('prefeitura.historico.colEvento')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((item) => (
                          <tr key={`${item.shiftId}-${item.userId}`}>
                            <td>
                              <div className={styles.tdMedico}>
                                <div className={styles.tdAvatar}>{initials(item.userName)}</div>
                                <strong>{item.userName}</strong>
                                <ProfessionalTypeBadge type={item.professionalType} />
                              </div>
                            </td>
                            <td>
                              <strong>{formatDate(item.date)}</strong>
                            </td>
                            <td>{turnoLabel(item.turno, t)}</td>
                            <td className={styles.center}>{formatTime(item.expectedTime)}</td>
                            <td className={styles.center}>
                              {item.checkInTime ? formatDateTime(item.checkInTime) : t('prefeitura.historico.notAvailable')}
                            </td>
                            <td className={styles.center}>
                              {item.checkOutTime ? formatDateTime(item.checkOutTime) : t('prefeitura.historico.notAvailable')}
                            </td>
                            <td className={styles.center}>
                              <span className={`${styles.badge} ${badgeClass(item.type, styles)}`}>
                                {eventLabel(item.type, t)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function DayBlock({
  date,
  items,
  t,
}: {
  date: string;
  items: PrefeituraUnitTimelineItem[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const inCount = items.filter((i) => i.type === 'in').length;
  const lateCount = items.filter((i) => i.type === 'late').length;
  const absentCount = items.filter((i) => i.type === 'absent').length;
  const dotColor = absentCount > 0 ? '#ef4444' : lateCount > 0 ? '#f59e0b' : '#22c55e';

  return (
    <div className={styles.dayBlock}>
      <div className={styles.dayHeader}>
        <div className={styles.dayHeaderLeft}>
          <div className={styles.dayDot} style={{ background: dotColor }} />
          <div>
            <div className={styles.dayDate}>{formatDate(date)}</div>
            <div className={styles.dayTurno}>
              {t('prefeitura.historico.recordsCount', { count: items.length })}
            </div>
          </div>
        </div>
        <div className={styles.dayPills}>
          {inCount > 0 && <span className={`${styles.dayPill} ${styles.dayPillOk}`}>{inCount} {t('prefeitura.historico.eventoIn')}</span>}
          {lateCount > 0 && <span className={`${styles.dayPill} ${styles.dayPillWarn}`}>{lateCount} {t('prefeitura.historico.eventoLate')}</span>}
          {absentCount > 0 && <span className={`${styles.dayPill} ${styles.dayPillDanger}`}>{absentCount} {t('prefeitura.historico.eventoAbsent')}</span>}
        </div>
      </div>
      <div className={styles.timelineInner}>
        {items.map((item) => (
          <div className={styles.tlEvent} key={`${item.shiftId}-${item.userId}`}>
            <div className={`${styles.tlDot} ${styles[item.type]}`} />
            <div className={styles.tlBody}>
              <div className={styles.tlTime}>
                {item.checkInTime ? formatTimeOnly(item.checkInTime) : formatTime(item.expectedTime)}
              </div>
              <div className={styles.tlName}>
                {item.userName}
                <ProfessionalTypeBadge type={item.professionalType} />
              </div>
              <div className={styles.tlDetail}>
                <span className={`${styles.tlBadge} ${styles[item.type]}`}>{eventLabel(item.type, t)}</span>
                {item.type === 'in' && item.checkOutTime && (
                  <span>
                    {t('prefeitura.historico.colCheckin')}: {formatTimeOnly(item.checkInTime!)} · {t('prefeitura.historico.colCheckout')}: {formatTimeOnly(item.checkOutTime)}
                  </span>
                )}
                {item.type === 'late' && (
                  <span>
                    {t('prefeitura.historico.colCheckin')}: {formatTimeOnly(item.checkInTime!)} (+{item.minutesLate ?? 0} min)
                  </span>
                )}
                {item.type === 'absent' && (
                  <span>{t('prefeitura.historico.colExpected')}: {formatTime(item.expectedTime)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function badgeClass(type: string, s: Record<string, string>): string {
  if (type === 'in') return s.badgeIn;
  if (type === 'late') return s.badgeLate;
  return s.badgeAbsent;
}

function eventLabel(type: string, t: (key: string) => string): string {
  if (type === 'in') return t('prefeitura.historico.badgeIn');
  if (type === 'late') return t('prefeitura.historico.badgeLate');
  return t('prefeitura.historico.badgeAbsent');
}

function turnoLabel(turno: string, t: (key: string) => string): string {
  if (turno === 'manha') return t('prefeitura.historico.turnoManha');
  if (turno === 'tarde') return t('prefeitura.historico.turnoTarde');
  return t('prefeitura.historico.turnoNoite');
}

function initials(name: string): string {
  return name
    .replace(/^(Dr\.|Dra\.)\s*/i, '')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return formatShortDateBR(iso);
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return formatHmBR(iso);
  } catch {
    return iso;
  }
}

function formatTimeOnly(iso: string): string {
  return formatDateTime(iso);
}

/** Formata TimeSpan serializado pelo backend ("HH:mm:ss") pra "HH:mm". */
function formatTime(timeSpan: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeSpan);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : timeSpan;
}
