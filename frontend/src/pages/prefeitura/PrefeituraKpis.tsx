import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraKpisResponse } from '../../api/prefeituraApi';
import { ProfessionalTypeBadge } from './ProfessionalTypeBadge';
import styles from './PrefeituraKpis.module.css';

const UPA_RANK_COLORS = ['#22c55e', '#2dbfb8', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'];

/**
 * Sub-view "Indicadores (KPIs)" do portal Prefeitura. Baseada no mock
 * op-kpis.html: hero com 4 cards (taxa global/ausências/atrasos/médicos
 * ativos) com trend vs período anterior, ranking por UPA, gráfico de
 * evolução (últimos 5 períodos) e dois rankings de médicos (mais
 * ausências / 100% de frequência).
 *
 * Comparação de período: dado o intervalo [from,to] selecionado, calcula
 * 5 períodos consecutivos de mesmo tamanho terminando em `to`, e chama
 * getKpis() uma vez por período em paralelo. O último é o período atual,
 * o penúltimo é "o período anterior" pra comparação de trend — assim
 * cobrimos tanto o card de trend quanto o mini-gráfico de evolução com
 * uma única bateria de chamadas.
 */
export function PrefeituraKpis() {
  const { t } = useTranslation();
  const [periods, setPeriods] = useState<PrefeituraKpisResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  async function fetchKpis(f: string, tParam: string) {
    setLoading(true);
    setError(null);
    try {
      const ranges = buildTrailingPeriods(f, tParam, 5);
      const results = await Promise.all(
        ranges.map((r) => prefeituraApi.getKpis(r.from, r.to)),
      );
      setPeriods(results);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      setError(raw.includes('NO_ORGAN_CONTEXT') ? t('prefeitura.errors.noOrgan') : t('prefeitura.errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchKpis(defaultFrom, defaultTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e: FormEvent) {
    e.preventDefault();
    fetchKpis(from, to);
  }

  const current = periods.length > 0 ? periods[periods.length - 1] : null;
  const previous = periods.length > 1 ? periods[periods.length - 2] : null;

  const compliance = current ? `${current.globalComplianceRate.toFixed(1)}%` : '—';
  const period = current
    ? `${formatDate(current.from)} → ${formatDate(current.to)}`
    : t('prefeitura.kpis.periodPlaceholder');

  const complianceTrend = useMemo(
    () => (current && previous ? current.globalComplianceRate - previous.globalComplianceRate : null),
    [current, previous],
  );
  const absencesTrend = useMemo(
    () => (current && previous ? current.totalAbsences - previous.totalAbsences : null),
    [current, previous],
  );
  const lateTrend = useMemo(
    () => (current && previous ? current.totalLateEvents - previous.totalLateEvents : null),
    [current, previous],
  );
  const doctorsTrend = useMemo(
    () => (current && previous ? current.totalActiveDoctors - previous.totalActiveDoctors : null),
    [current, previous],
  );

  const upaRanking = useMemo(
    () => (current ? [...(current.byClinic ?? [])].sort((a, b) => b.complianceRate - a.complianceRate).slice(0, 6) : []),
    [current],
  );

  const evolutionPoints = useMemo(
    () => periods.map((p) => ({ label: formatShortDate(p.to), rate: p.globalComplianceRate })),
    [periods],
  );

  return (
    <div className={styles.container}>
      {/* ── Filtros ── */}
      <form className={styles.filters} onSubmit={handleFilter}>
        <div className={styles.filterGroup}>
          <label htmlFor="kpis-from" className={styles.filterLabel}>
            {t('prefeitura.kpis.from')}
          </label>
          <input
            id="kpis-from"
            type="date"
            className={styles.filterInput}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="kpis-to" className={styles.filterLabel}>
            {t('prefeitura.kpis.to')}
          </label>
          <input
            id="kpis-to"
            type="date"
            className={styles.filterInput}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button type="submit" className={styles.filterButton} disabled={loading}>
          {loading ? t('prefeitura.common.loading') : t('prefeitura.kpis.apply')}
        </button>
      </form>

      {loading && !current && <div className={styles.loading}>{t('prefeitura.common.loading')}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {current && (
        <>
          {/* ── Hero: 4 cards com trend ── */}
          <section className={styles.hero} aria-label={t('prefeitura.kpis.gridAriaLabel')}>
            <div className={`${styles.heroCard} ${styles.heroFeatured}`}>
              <div className={styles.heroLabel}>{t('prefeitura.kpis.heroLabel')}</div>
              <div className={styles.heroValue}>{compliance}</div>
              <div className={styles.heroSub}>{t('prefeitura.kpis.heroSub')}</div>
              {renderTrend(complianceTrend, false, t)}
            </div>
            <div className={styles.heroCard}>
              <div className={styles.heroLabel}>{t('prefeitura.kpis.cardAbsences')}</div>
              <div className={styles.heroValue} style={{ color: '#ef4444' }}>
                {current.totalAbsences}
              </div>
              <div className={styles.heroSub}>{t('prefeitura.kpis.cardAbsencesSub')}</div>
              {renderTrend(absencesTrend, true, t)}
            </div>
            <div className={styles.heroCard}>
              <div className={styles.heroLabel}>{t('prefeitura.kpis.cardLate')}</div>
              <div className={styles.heroValue} style={{ color: '#f59e0b' }}>
                {current.totalLateEvents}
              </div>
              <div className={styles.heroSub}>{t('prefeitura.kpis.cardLateSub')}</div>
              {renderTrend(lateTrend, true, t)}
            </div>
            <div className={styles.heroCard}>
              <div className={styles.heroLabel}>{t('prefeitura.kpis.cardActiveDoctors')}</div>
              <div className={styles.heroValue} style={{ color: '#8b5cf6' }}>
                {current.totalActiveDoctors}
              </div>
              <div className={styles.heroSub}>{t('prefeitura.kpis.cardActiveDoctorsSub')}</div>
              {(current.totalActiveMedicos > 0 || current.totalActiveEnfermeiros > 0) && (
                <div className={styles.heroSub} style={{ marginTop: '0.2rem' }}>
                  {t('prefeitura.kpis.cardActiveMedicos')}: {current.totalActiveMedicos} ·{' '}
                  {t('prefeitura.kpis.cardActiveEnfermeiros')}: {current.totalActiveEnfermeiros}
                </div>
              )}
              {renderTrend(doctorsTrend, false, t)}
            </div>
          </section>

          <div className={styles.heroPeriod}>{period}</div>

          {/* ── Grid meio: ranking UPA + evolução ── */}
          <section className={styles.midGrid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>{t('prefeitura.kpis.rankTitle')}</div>
                <div className={styles.cardSub}>{t('prefeitura.kpis.rankSub')}</div>
              </div>
              <div className={styles.cardBody}>
                {upaRanking.length === 0 ? (
                  <div className={styles.miniEmpty}>{t('prefeitura.kpis.rankEmpty')}</div>
                ) : (
                  <div className={styles.upaRankList}>
                    {upaRanking.map((u, i) => (
                      <div className={styles.upaRankItem} key={u.clinicId}>
                        <div className={styles.upaRankPos}>{i + 1}º</div>
                        <div className={styles.upaRankBarWrap}>
                          <div className={styles.upaRankName}>
                            <span>{u.clinicName}</span>
                            <span
                              className={styles.upaRankPct}
                              style={{ color: UPA_RANK_COLORS[i % UPA_RANK_COLORS.length] }}
                            >
                              {u.complianceRate.toFixed(1)}%
                            </span>
                          </div>
                          <div className={styles.upaRankBg}>
                            <div
                              className={styles.upaRankFill}
                              style={{
                                width: `${Math.min(100, u.complianceRate)}%`,
                                background: UPA_RANK_COLORS[i % UPA_RANK_COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>{t('prefeitura.kpis.evolutionTitle')}</div>
                <div className={styles.cardSub}>{t('prefeitura.kpis.evolutionSub')}</div>
              </div>
              <div className={styles.cardBody}>
                {evolutionPoints.length < 2 ? (
                  <div className={styles.miniEmpty}>{t('prefeitura.kpis.evolutionEmpty')}</div>
                ) : (
                  <EvolutionChart points={evolutionPoints} />
                )}
              </div>
            </div>
          </section>

          {/* ── Bottom grid: rankings de médicos + tabela por UPA ── */}
          <section className={styles.bottomGrid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>{t('prefeitura.kpis.topAbsenceTitle')}</div>
                <div className={styles.cardSub}>{t('prefeitura.kpis.topAbsenceSub')}</div>
              </div>
              <div className={styles.cardBody}>
                {(current.topAbsenceDoctors ?? []).length === 0 ? (
                  <div className={styles.miniEmpty}>{t('prefeitura.kpis.topAbsenceEmpty')}</div>
                ) : (
                  <div className={styles.medList}>
                    {current.topAbsenceDoctors.map((m) => (
                      <div className={styles.medItem} key={m.userId}>
                        <div className={styles.medAvatar} style={{ background: '#ef4444' }}>
                          {initials(m.userName)}
                        </div>
                        <div className={styles.medInfo}>
                          <div className={styles.medName}>
                            {m.userName}
                            <ProfessionalTypeBadge type={m.professionalType} />
                          </div>
                          <div className={styles.medUpa}>{m.clinicName}</div>
                        </div>
                        <div className={styles.medStat} style={{ color: '#ef4444' }}>
                          {t('prefeitura.kpis.absenceCount', { count: m.absences })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>{t('prefeitura.kpis.perfectTitle')}</div>
                <div className={styles.cardSub}>{t('prefeitura.kpis.perfectSub')}</div>
              </div>
              <div className={styles.cardBody}>
                {(current.perfectAttendanceDoctors ?? []).length === 0 ? (
                  <div className={styles.miniEmpty}>{t('prefeitura.kpis.perfectEmpty')}</div>
                ) : (
                  <div className={styles.medList}>
                    {current.perfectAttendanceDoctors.map((m) => (
                      <div className={styles.medItem} key={m.userId}>
                        <div className={styles.medAvatar} style={{ background: '#22c55e' }}>
                          {initials(m.userName)}
                        </div>
                        <div className={styles.medInfo}>
                          <div className={styles.medName}>
                            {m.userName}
                            <ProfessionalTypeBadge type={m.professionalType} />
                          </div>
                          <div className={styles.medUpa}>{m.clinicName}</div>
                        </div>
                        <div className={styles.medStat} style={{ color: '#22c55e' }}>
                          {m.complianceRate.toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Tabela por UPA ── */}
          <section className={styles.tableWrap}>
            <div className={styles.tableHeader}>
              <div className={styles.tableTitle}>{t('prefeitura.kpis.tableTitle')}</div>
            </div>
            {(current.byClinic ?? []).length === 0 ? (
              <div className={styles.empty}>{t('prefeitura.kpis.tableEmpty')}</div>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('prefeitura.kpis.tableClinic')}</th>
                      <th>{t('prefeitura.kpis.tableCompliance')}</th>
                      <th>{t('prefeitura.kpis.tableExpected')}</th>
                      <th>{t('prefeitura.kpis.tableCovered')}</th>
                      <th>{t('prefeitura.kpis.tableAbsences')}</th>
                      <th>{t('prefeitura.kpis.tableLate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.byClinic.map((c) => (
                      <tr key={c.clinicId}>
                        <td>{c.clinicName}</td>
                        <td className={rateClass(c.complianceRate)}>
                          {c.complianceRate.toFixed(1)}%
                        </td>
                        <td>{c.expectedShifts}</td>
                        <td>{c.coveredShifts}</td>
                        <td>{c.absences}</td>
                        <td>{c.lateEvents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Classe CSS por faixa de compliance (>=90 verde, 70-90 laranja, <70 vermelho). */
function rateClass(rate: number): string {
  if (rate >= 90) return styles.tableRateGood;
  if (rate >= 70) return styles.tableRateWarn;
  return styles.tableRateBad;
}

/** Formata ISO date string pra pt-BR curta (dd/MM/yyyy). */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** Formata ISO date string pra label curta de eixo (dd/MM). */
function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return iso;
  }
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

/**
 * Calcula N períodos consecutivos de mesmo tamanho, terminando em `to`
 * (índice N-1 = período selecionado pelo usuário) e recuando no tempo.
 * Ex.: from=01/06, to=01/07 (30 dias) com n=5 gera 5 janelas de 30 dias
 * cada, a mais antiga terminando ~120 dias antes de `to`.
 */
function buildTrailingPeriods(from: string, to: string, n: number): Array<{ from: string; to: string }> {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const spanMs = Math.max(1, toDate.getTime() - fromDate.getTime());

  const ranges: Array<{ from: string; to: string }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const windowTo = new Date(toDate.getTime() - i * spanMs);
    const windowFrom = new Date(windowTo.getTime() - spanMs);
    ranges.push({
      from: windowFrom.toISOString().slice(0, 10),
      to: windowTo.toISOString().slice(0, 10),
    });
  }
  return ranges;
}

/** Trend badge (↑/↓/→) — verde quando "bom", vermelho quando "mau". */
function renderTrend(
  delta: number | null,
  higherIsWorse: boolean,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  if (delta === null) return null;
  const rounded = Math.round(delta * 10) / 10;
  const isFlat = Math.abs(rounded) < 0.05;
  const isGood = isFlat ? null : higherIsWorse ? rounded < 0 : rounded > 0;
  const arrow = isFlat ? t('prefeitura.kpis.trendFlat') : rounded > 0 ? t('prefeitura.kpis.trendUp') : t('prefeitura.kpis.trendDown');
  const cls = isFlat ? 'trendFlat' : isGood ? 'trendUp' : 'trendDown';
  return (
    <div className={`${styles.trend} ${styles[cls]}`}>
      {arrow} {Math.abs(rounded).toFixed(1)} {t('prefeitura.kpis.vsPrevious')}
    </div>
  );
}

/** Mini-gráfico de evolução — linha SVG simples (sem libs externas). */
function EvolutionChart({ points }: { points: Array<{ label: string; rate: number }> }) {
  const width = 320;
  const height = 140;
  const padX = 24;
  const padY = 18;
  const values = points.map((p) => p.rate);
  const min = Math.min(...values, 100) - 5;
  const max = Math.max(...values, 0) + 5;
  const range = Math.max(1, max - min);

  const stepX = (width - padX * 2) / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => {
    const x = padX + i * stepX;
    const y = padY + (height - padY * 2) * (1 - (p.rate - min) / range);
    return { x, y, rate: p.rate, label: p.label };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${height - padY} L${coords[0].x},${height - padY} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de evolução do cumprimento">
      <path d={areaPath} fill="rgba(45,191,184,0.12)" />
      <path d={linePath} fill="none" stroke="#2dbfb8" strokeWidth={2.5} />
      {coords.map((c, i) => (
        <g key={`${c.label}-${i}`}>
          <circle cx={c.x} cy={c.y} r={4} fill="#fff" stroke="#2dbfb8" strokeWidth={2.5} />
          <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize={10} fontWeight={800} fill="#1a2a2a">
            {c.rate.toFixed(1)}%
          </text>
          <text x={c.x} y={height - 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#7a9090">
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
