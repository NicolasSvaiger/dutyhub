import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  prefeituraApi,
  type PrefeituraFrequencyByDoctorItem,
  type PrefeituraClinicItem,
} from '../../api/prefeituraApi';
import { ProfessionalTypeBadge } from './ProfessionalTypeBadge';
import styles from './PrefeituraFrequencia.module.css';

/**
 * Sub-view "Frequência" do portal Prefeitura. Baseada no mock
 * op-frequencia.html — tabela "Frequência por Médico" (uma linha por
 * profissional, agregando todos os plantões no período) em vez da antiga
 * tabela previsto x realizado por (UPA, dia). Filtros de período + UPA +
 * médico + situação (adimplente/atenção/crítico), todos aplicados
 * client-side sobre o resultado de getFrequencyByDoctor — o dataset por
 * gestor é pequeno (dezenas de médicos), então não vale ida ao backend
 * a cada troca de filtro texto/situação.
 */
export function PrefeituraFrequencia() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrefeituraFrequencyByDoctorItem[]>([]);
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
  const [clinicId, setClinicId] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'ok' | 'warn' | 'danger'>('');
  const [professionalTypeFilter, setProfessionalTypeFilter] = useState('');

  async function fetchData(f: string, tp: string, c: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await prefeituraApi.getFrequencyByDoctor(f, tp, c || undefined);
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
    fetchData(defaultFrom, defaultTo, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e: FormEvent) {
    e.preventDefault();
    fetchData(from, to, clinicId);
  }

  function handleClear() {
    setDoctorFilter('');
    setStatusFilter('');
    setProfessionalTypeFilter('');
  }

  async function handleExport(format: 'pdf' | 'xlsx') {
    setExporting(true);
    try {
      await prefeituraApi.downloadReport('frequency', format, {
        from,
        to,
        clinicId: clinicId || undefined,
      });
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

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchDoctor = !doctorFilter || item.userName.toLowerCase().includes(doctorFilter.toLowerCase());
      const matchStatus = !statusFilter || situacao(item.complianceRate) === statusFilter;
      const matchType = !professionalTypeFilter || item.professionalType === professionalTypeFilter;
      return matchDoctor && matchStatus && matchType;
    });
  }, [items, doctorFilter, statusFilter, professionalTypeFilter]);

  const doctorOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.userName))).sort(),
    [items],
  );

  const totalExpected = filtered.reduce((sum, i) => sum + i.expectedShifts, 0);
  const totalCompleted = filtered.reduce((sum, i) => sum + i.completedShifts, 0);
  const avgCompliance = totalExpected === 0 ? 0 : Math.round((100 * totalCompleted) / totalExpected);
  const criticalCount = filtered.filter((i) => i.complianceRate < 70).length;

  return (
    <div className={styles.container}>
      {/* ── Filtros ── */}
      <form className={styles.filters} onSubmit={handleFilter}>
        <div className={styles.filterGroup}>
          <label htmlFor="freq-from" className={styles.filterLabel}>
            {t('prefeitura.kpis.from')}
          </label>
          <input
            id="freq-from"
            type="date"
            className={styles.filterInput}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="freq-to" className={styles.filterLabel}>
            {t('prefeitura.kpis.to')}
          </label>
          <input
            id="freq-to"
            type="date"
            className={styles.filterInput}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="freq-clinic" className={styles.filterLabel}>
            {t('prefeitura.escalas.clinicLabel')}
          </label>
          <select
            id="freq-clinic"
            className={styles.filterSelect}
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
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
          <label htmlFor="freq-doctor" className={styles.filterLabel}>
            {t('prefeitura.frequencia.doctorLabel')}
          </label>
          <select
            id="freq-doctor"
            className={styles.filterSelect}
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
          >
            <option value="">{t('prefeitura.frequencia.allDoctors')}</option>
            {doctorOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="freq-type" className={styles.filterLabel}>
            {t('prefeitura.common.professionalTypeFilterLabel')}
          </label>
          <select
            id="freq-type"
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
          <label htmlFor="freq-status" className={styles.filterLabel}>
            {t('prefeitura.frequencia.statusLabel')}
          </label>
          <select
            id="freq-status"
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="">{t('prefeitura.frequencia.allStatus')}</option>
            <option value="ok">{t('prefeitura.frequencia.statusOk')}</option>
            <option value="warn">{t('prefeitura.frequencia.statusWarn')}</option>
            <option value="danger">{t('prefeitura.frequencia.statusDanger')}</option>
          </select>
        </div>
        <div className={styles.filterActions}>
          <button type="submit" className={styles.filterButton} disabled={loading}>
            {loading ? t('prefeitura.common.loading') : t('prefeitura.kpis.apply')}
          </button>
          <button type="button" className={styles.exportButton} onClick={handleClear}>
            {t('prefeitura.ausencias.cancel')}
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
        <div className={styles.empty}>{t('prefeitura.frequencia.empty')}</div>
      )}

      {items.length > 0 && (
        <>
          {/* ── KPIs ── */}
          <section className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>{t('prefeitura.frequencia.kpiDoctors')}</div>
              <div className={styles.kpiValue}>{filtered.length}</div>
              <div className={styles.kpiSub}>{t('prefeitura.frequencia.kpiDoctorsSub')}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>{t('prefeitura.frequencia.kpiCompleted')}</div>
              <div className={styles.kpiValue}>{totalCompleted}</div>
              <div className={styles.kpiSub}>
                {t('prefeitura.frequencia.kpiCompletedSub', { expected: totalExpected })}
              </div>
            </div>
            <div className={`${styles.kpiCard} ${styles.warn}`}>
              <div className={styles.kpiLabel}>{t('prefeitura.frequencia.kpiAvg')}</div>
              <div className={styles.kpiValue}>{avgCompliance}%</div>
              <div className={styles.kpiSub}>{t('prefeitura.frequencia.kpiAvgSub')}</div>
            </div>
            <div className={`${styles.kpiCard} ${styles.bad}`}>
              <div className={styles.kpiLabel}>{t('prefeitura.frequencia.kpiCritical')}</div>
              <div className={styles.kpiValue}>{criticalCount}</div>
              <div className={styles.kpiSub}>{t('prefeitura.frequencia.kpiCriticalSub')}</div>
            </div>
          </section>

          {/* ── Tabela ── */}
          <section className={styles.tableWrap}>
            <div className={styles.tableHeader}>
              <div className={styles.tableTitle}>{t('prefeitura.frequencia.tableTitle')}</div>
              <div className={styles.tableCount}>
                {t('prefeitura.frequencia.rowCount', { count: filtered.length })}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className={styles.empty} style={{ border: 'none' }}>
                {t('prefeitura.frequencia.empty')}
              </div>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('prefeitura.frequencia.colDoctor')}</th>
                      <th>{t('prefeitura.frequencia.colClinic')}</th>
                      <th className={styles.center}>{t('prefeitura.frequencia.colExpected')}</th>
                      <th className={styles.center}>{t('prefeitura.frequencia.colCompleted')}</th>
                      <th className={styles.center}>{t('prefeitura.frequencia.colAbsences')}</th>
                      <th className={styles.center}>{t('prefeitura.frequencia.colLate')}</th>
                      <th>{t('prefeitura.frequencia.colCompliance')}</th>
                      <th className={styles.center}>{t('prefeitura.frequencia.colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => {
                      const sit = situacao(item.complianceRate);
                      const color = progColor(item.complianceRate);
                      return (
                        <tr key={item.userId}>
                          <td>
                            <div className={styles.doctorCell}>
                              <div className={styles.avatar}>{initials(item.userName)}</div>
                              <div>
                                <div className={styles.doctorName}>
                                  {item.userName}
                                  <ProfessionalTypeBadge type={item.professionalType} />
                                </div>
                                {item.registrationNumber && (
                                  <div className={styles.registrationNumber}>{item.registrationNumber}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>{item.clinicName}</td>
                          <td className={styles.center}>
                            <strong>{item.expectedShifts}</strong>
                          </td>
                          <td className={styles.center}>
                            <strong style={{ color: '#2dbfb8' }}>{item.completedShifts}</strong>
                          </td>
                          <td className={styles.center}>
                            {item.absences > 0 ? (
                              <strong style={{ color: '#e05555' }}>{item.absences}</strong>
                            ) : (
                              <span style={{ color: '#7a9090' }}>—</span>
                            )}
                          </td>
                          <td className={styles.center}>
                            {item.lateEvents > 0 ? (
                              <strong style={{ color: '#f5a623' }}>{item.lateEvents}</strong>
                            ) : (
                              <span style={{ color: '#7a9090' }}>—</span>
                            )}
                          </td>
                          <td>
                            <div className={styles.progressCell}>
                              <div className={styles.progressBarBg}>
                                <div
                                  className={styles.progressBarFill}
                                  style={{ width: `${item.complianceRate}%`, background: color }}
                                />
                              </div>
                              <span className={styles.progressPct} style={{ color }}>
                                {item.complianceRate.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className={styles.center}>
                            <span className={`${styles.badge} ${badgeClass(sit, styles)}`}>
                              {t(`prefeitura.frequencia.status${capitalize(sit)}`)}
                            </span>
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

type Situacao = 'ok' | 'warn' | 'danger';

function situacao(rate: number): Situacao {
  if (rate >= 90) return 'ok';
  if (rate >= 70) return 'warn';
  return 'danger';
}

function progColor(rate: number): string {
  if (rate >= 90) return '#22c55e';
  if (rate >= 70) return '#f59e0b';
  return '#ef4444';
}

function badgeClass(sit: Situacao, s: Record<string, string>): string {
  if (sit === 'ok') return s.badgeOk;
  if (sit === 'warn') return s.badgeWarn;
  return s.badgeDanger;
}

function capitalize(sit: Situacao): string {
  const map: Record<Situacao, string> = { ok: 'Adimplente', warn: 'Atencao', danger: 'Critico' };
  return map[sit];
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
