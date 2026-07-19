import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraAbsenceItem, type PrefeituraClinicItem } from '../../api/prefeituraApi';
import { ProfessionalTypeBadge } from './ProfessionalTypeBadge';
import styles from './PrefeituraAtrasos.module.css';

const CLINIC_COLORS = ['#2dbfb8', '#f5a623', '#8b5cf6', '#ef4444', '#3b82f6', '#22c55e'];

/**
 * Sub-view "Atrasos" do portal Prefeitura. Baseada no mock op-atrasos.html:
 * card de tolerância ajustável (slider 5-60min, refetch com toleranceMinutes
 * override no backend), filtros de UPA/médico/gravidade, KPIs, gráfico de
 * barras por UPA e ranking de reincidentes (3+ atrasos no período),
 * derivados client-side do resultado de getAbsences('late').
 */
export function PrefeituraAtrasos() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrefeituraAbsenceItem[]>([]);
  const [clinics, setClinics] = useState<PrefeituraClinicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [tolerance, setTolerance] = useState(15);
  const [clinicFilter, setClinicFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'' | 'light' | 'medium' | 'high'>('');
  const [professionalTypeFilter, setProfessionalTypeFilter] = useState('');

  async function fetchData(f: string, tp: string, tol: number) {
    setLoading(true);
    setError(null);
    try {
      const result = await prefeituraApi.getAbsences(f, tp, 'late', tol);
      setItems(result);
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

  useEffect(() => {
    prefeituraApi.getClinics().then(setClinics).catch(() => { /* silent */ });
    fetchData(defaultFrom, defaultTo, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e: FormEvent) {
    e.preventDefault();
    fetchData(from, to, tolerance);
  }

  function handleToleranceChange(value: number) {
    setTolerance(value);
    fetchData(from, to, value);
  }

  async function handleExport(format: 'pdf' | 'xlsx') {
    setExporting(true);
    try {
      await prefeituraApi.downloadReport('atrasos', format, { from, to });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      setError(
        raw.includes('NO_ORGAN_CONTEXT')
          ? t('prefeitura.errors.noOrgan')
          : t('prefeitura.errors.generic'),
      );
    } finally {
      setExporting(false);
    }
  }

  // Contagem de atrasos por médico — base pro ranking e pro flag "reincidente".
  const countsByDoctor = useMemo(() => {
    const map = new Map<string, { userName: string; clinicName: string; count: number }>();
    for (const item of items) {
      const existing = map.get(item.userId);
      if (existing) {
        existing.count++;
      } else {
        map.set(item.userId, { userName: item.userName, clinicName: item.clinicName, count: 1 });
      }
    }
    return map;
  }, [items]);

  const recidivistUserIds = useMemo(
    () => new Set(Array.from(countsByDoctor.entries()).filter(([, v]) => v.count >= 3).map(([id]) => id)),
    [countsByDoctor],
  );

  const doctorOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.userName))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchClinic = !clinicFilter || item.clinicId === clinicFilter;
      const matchDoctor = !doctorFilter || item.userName === doctorFilter;
      const matchSeverity = !severityFilter || severity(item.minutesLate ?? 0) === severityFilter;
      const matchType = !professionalTypeFilter || item.professionalType === professionalTypeFilter;
      return matchClinic && matchDoctor && matchSeverity && matchType;
    });
  }, [items, clinicFilter, doctorFilter, severityFilter, professionalTypeFilter]);

  const totalCount = filtered.length;
  const avgMinutes = totalCount === 0
    ? 0
    : Math.round(filtered.reduce((sum, i) => sum + (i.minutesLate ?? 0), 0) / totalCount);
  const maxItem = filtered.reduce<PrefeituraAbsenceItem | null>(
    (max, i) => (!max || (i.minutesLate ?? 0) > (max.minutesLate ?? 0) ? i : max),
    null,
  );
  const recidivistCount = new Set(filtered.map((i) => i.userId)).size > 0
    ? Array.from(countsByDoctor.entries()).filter(([, v]) => v.count >= 3).length
    : 0;

  // Gráfico por UPA — contagem de atrasos filtrados, agrupados por clínica.
  const chartData = useMemo(() => {
    const map = new Map<string, { clinicName: string; count: number }>();
    for (const item of filtered) {
      const existing = map.get(item.clinicId);
      if (existing) existing.count++;
      else map.set(item.clinicId, { clinicName: item.clinicName, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filtered]);
  const maxChartCount = Math.max(1, ...chartData.map((c) => c.count));

  // Ranking top reincidentes (todos os médicos com atraso, ordenado por contagem).
  const ranking = useMemo(
    () => Array.from(countsByDoctor.values()).sort((a, b) => b.count - a.count).slice(0, 5),
    [countsByDoctor],
  );
  const medalClass = ['gold', 'silver', 'bronze', '', ''];

  const sliderPct = ((tolerance - 5) / (60 - 5)) * 100;

  return (
    <div className={styles.container}>
      {/* ── Tolerância ── */}
      <div className={styles.toleranceCard}>
        <div className={styles.toleranceLeft}>
          <div className={styles.toleranceTitle}>{t('prefeitura.atrasos.toleranceTitle')}</div>
          <div className={styles.toleranceSub}>{t('prefeitura.atrasos.toleranceSub')}</div>
        </div>
        <div className={styles.toleranceRight}>
          <div className={styles.sliderWrap}>
            <div className={styles.sliderLabels}>
              <span>5 min</span>
              <span>60 min</span>
            </div>
            <input
              type="range"
              className={styles.slider}
              min={5}
              max={60}
              step={5}
              value={tolerance}
              style={{ '--fill': `${sliderPct}%` } as CSSProperties}
              onChange={(e) => handleToleranceChange(Number(e.target.value))}
              aria-label={t('prefeitura.atrasos.toleranceTitle')}
            />
          </div>
          <div className={styles.toleranceValue}>
            <div className={styles.toleranceNum}>{tolerance}</div>
            <div className={styles.toleranceUnit}>{t('prefeitura.atrasos.toleranceUnit')}</div>
          </div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <form className={styles.filters} onSubmit={handleFilter}>
        <div className={styles.filterGroup}>
          <label htmlFor="atr-from" className={styles.filterLabel}>
            {t('prefeitura.kpis.from')}
          </label>
          <input
            id="atr-from"
            type="date"
            className={styles.filterInput}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="atr-to" className={styles.filterLabel}>
            {t('prefeitura.kpis.to')}
          </label>
          <input
            id="atr-to"
            type="date"
            className={styles.filterInput}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="atr-clinic" className={styles.filterLabel}>
            {t('prefeitura.escalas.clinicLabel')}
          </label>
          <select
            id="atr-clinic"
            className={styles.filterSelect}
            value={clinicFilter}
            onChange={(e) => setClinicFilter(e.target.value)}
          >
            <option value="">{t('prefeitura.escalas.allClinics')}</option>
            {clinics.map((c) => (
              <option key={c.clinicId} value={c.clinicId}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="atr-doctor" className={styles.filterLabel}>
            {t('prefeitura.atrasos.doctorLabel')}
          </label>
          <select
            id="atr-doctor"
            className={styles.filterSelect}
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
          >
            <option value="">{t('prefeitura.atrasos.allDoctors')}</option>
            {doctorOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="atr-type" className={styles.filterLabel}>
            {t('prefeitura.common.professionalTypeFilterLabel')}
          </label>
          <select
            id="atr-type"
            className={styles.filterSelect}
            value={professionalTypeFilter}
            onChange={(e) => setProfessionalTypeFilter(e.target.value)}
          >
            <option value="">{t('prefeitura.common.professionalTypeAll')}</option>
            <option value="Medico">{t('prefeitura.common.professionalTypeMedico')}</option>
            <option value="Enfermeiro">{t('prefeitura.common.professionalTypeEnfermeiro')}</option>
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="atr-severity" className={styles.filterLabel}>
            {t('prefeitura.atrasos.severityLabel')}
          </label>
          <select
            id="atr-severity"
            className={styles.filterSelect}
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          >
            <option value="">{t('prefeitura.atrasos.allSeverity')}</option>
            <option value="light">{t('prefeitura.atrasos.severityLight')}</option>
            <option value="medium">{t('prefeitura.atrasos.severityMedium')}</option>
            <option value="high">{t('prefeitura.atrasos.severityHigh')}</option>
          </select>
        </div>
        <div className={styles.filterActions}>
          <button type="submit" className={styles.filterButton} disabled={loading}>
            {loading ? t('prefeitura.common.loading') : t('prefeitura.kpis.apply')}
          </button>
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => handleExport('pdf')}
            disabled={exporting || filtered.length === 0}
          >
            {t('prefeitura.common.exportPdf')}
          </button>
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => handleExport('xlsx')}
            disabled={exporting || filtered.length === 0}
          >
            {t('prefeitura.common.exportXlsx')}
          </button>
        </div>
      </form>

      {loading && items.length === 0 && (
        <div className={styles.loading}>{t('prefeitura.common.loading')}</div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className={styles.empty}>{t('prefeitura.atrasos.empty')}</div>
      )}

      {items.length > 0 && (
        <>
          {/* ── KPIs ── */}
          <section className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>{t('prefeitura.atrasos.kpiTotal')}</div>
              <div className={styles.kpiValue}>{totalCount}</div>
              <div className={styles.kpiSub}>{t('prefeitura.atrasos.kpiTotalSub')}</div>
            </div>
            <div className={`${styles.kpiCard} ${styles.yellow}`}>
              <div className={styles.kpiLabel}>{t('prefeitura.atrasos.kpiAvg')}</div>
              <div className={styles.kpiValue}>{avgMinutes} min</div>
              <div className={styles.kpiSub}>{t('prefeitura.atrasos.kpiAvgSub')}</div>
            </div>
            <div className={`${styles.kpiCard} ${styles.red}`}>
              <div className={styles.kpiLabel}>{t('prefeitura.atrasos.kpiMax')}</div>
              <div className={styles.kpiValue}>{maxItem?.minutesLate ?? 0} min</div>
              <div className={styles.kpiSub}>{maxItem?.userName ?? t('prefeitura.atrasos.kpiMaxSub')}</div>
            </div>
            <div className={`${styles.kpiCard} ${styles.purple}`}>
              <div className={styles.kpiLabel}>{t('prefeitura.atrasos.kpiRecidivist')}</div>
              <div className={styles.kpiValue}>{recidivistCount}</div>
              <div className={styles.kpiSub}>{t('prefeitura.atrasos.kpiRecidivistSub')}</div>
            </div>
          </section>

          {/* ── Gráfico + ranking ── */}
          <section className={styles.bottomGrid}>
            <div className={styles.chartCard}>
              <div className={styles.cardTitle}>{t('prefeitura.atrasos.chartTitle')}</div>
              <div className={styles.chartBars}>
                {chartData.map((c, i) => {
                  const pct = Math.round((c.count / maxChartCount) * 100);
                  const color = CLINIC_COLORS[i % CLINIC_COLORS.length];
                  return (
                    <div className={styles.chartRow} key={c.clinicName}>
                      <div className={styles.chartLabel}>{c.clinicName}</div>
                      <div className={styles.chartBarBg}>
                        <div
                          className={styles.chartBarFill}
                          style={{ width: `${pct}%`, background: color }}
                        >
                          {c.count > 0 ? `${c.count}` : ''}
                        </div>
                      </div>
                      <div className={styles.chartCount} style={{ color }}>
                        {c.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={styles.rankCard}>
              <div className={styles.cardTitle}>{t('prefeitura.atrasos.rankTitle')}</div>
              {ranking.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#7a9090', fontSize: '.8rem', fontWeight: 700 }}>
                  {t('prefeitura.atrasos.rankEmpty')}
                </div>
              ) : (
                <div className={styles.rankList}>
                  {ranking.map((r, i) => (
                    <div className={styles.rankItem} key={r.userName}>
                      <div className={`${styles.rankNum} ${styles[medalClass[i]] ?? ''}`}>{i + 1}º</div>
                      <div className={styles.rankAvatar}>{initials(r.userName)}</div>
                      <div style={{ flex: 1 }}>
                        <div className={styles.rankName}>{r.userName}</div>
                        <div className={styles.rankClinic}>{r.clinicName}</div>
                      </div>
                      <div className={styles.rankCount}>{r.count}x</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── Tabela ── */}
          <section className={styles.tableWrap}>
            <div className={styles.tableHeader}>
              <div className={styles.tableTitle}>{t('prefeitura.atrasos.tableTitle')}</div>
              <div className={styles.tableCount}>
                {t('prefeitura.atrasos.rowCount', { count: filtered.length })}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className={styles.empty} style={{ border: 'none' }}>
                {t('prefeitura.atrasos.empty')}
              </div>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('prefeitura.atrasos.colDoctor')}</th>
                      <th>{t('prefeitura.atrasos.colClinic')}</th>
                      <th>{t('prefeitura.atrasos.colDate')}</th>
                      <th>{t('prefeitura.atrasos.shift')}</th>
                      <th className={styles.center}>{t('prefeitura.atrasos.colDelay')}</th>
                      <th className={styles.center}>{t('prefeitura.atrasos.colSeverity')}</th>
                      <th className={styles.center}>{t('prefeitura.atrasos.colRecidivist')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => {
                      const sev = severity(item.minutesLate ?? 0);
                      const color = severityColor(sev);
                      const isRecidivist = recidivistUserIds.has(item.userId);
                      return (
                        <tr key={item.id}>
                          <td>
                            <div className={styles.doctorCell}>
                              <div className={styles.avatar} style={{ background: `linear-gradient(135deg, ${color}, ${color}aa)` }}>
                                {initials(item.userName)}
                              </div>
                              <span>
                                {item.userName}
                                <ProfessionalTypeBadge type={item.professionalType} />
                              </span>
                            </div>
                          </td>
                          <td>
                            <strong>{item.clinicName}</strong>
                          </td>
                          <td>
                            <strong>{formatDate(item.date)}</strong>
                          </td>
                          <td>{item.shiftLabel}</td>
                          <td className={styles.center}>
                            <span
                              className={styles.delayPill}
                              style={{ background: `${color}22`, color }}
                            >
                              +{item.minutesLate ?? 0} min
                            </span>
                          </td>
                          <td className={styles.center}>
                            <span className={`${styles.badge} ${badgeClass(sev, styles)}`}>
                              {t(`prefeitura.atrasos.sev${capitalize(sev)}`)}
                            </span>
                          </td>
                          <td className={styles.center}>
                            {isRecidivist ? (
                              <span className={`${styles.badge} ${styles.badgeRecidivist}`}>
                                ⚠ {t('prefeitura.atrasos.recidivistBadge')}
                              </span>
                            ) : (
                              <span style={{ color: '#7a9090', fontSize: '.72rem', fontWeight: 700 }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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

type Severity = 'light' | 'medium' | 'high';

function severity(minutes: number): Severity {
  if (minutes <= 30) return 'light';
  if (minutes <= 60) return 'medium';
  return 'high';
}

function severityColor(sev: Severity): string {
  if (sev === 'light') return '#f59e0b';
  if (sev === 'medium') return '#c45000';
  return '#ef4444';
}

function badgeClass(sev: Severity, s: Record<string, string>): string {
  if (sev === 'light') return s.badgeLight;
  if (sev === 'medium') return s.badgeMedium;
  return s.badgeHigh;
}

function capitalize(sev: Severity): string {
  const map: Record<Severity, string> = { light: 'Light', medium: 'Medium', high: 'High' };
  return map[sev];
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
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return iso;
  }
}
