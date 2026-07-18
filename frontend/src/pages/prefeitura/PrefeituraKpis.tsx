import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraKpisResponse } from '../../api/prefeituraApi';
import styles from './PrefeituraKpis.module.css';

/**
 * Sub-view "KPIs" do portal Prefeitura. Filtro de período (from/to) que
 * dispara getKpis() — sem filtro faz fetch com defaults do backend (30d).
 * Card hero grande com % de cumprimento global + grid de 6 métricas +
 * tabela por UPA com colorização por faixa (>=90 verde, 70-90 orange,
 * <70 vermelho).
 */
export function PrefeituraKpis() {
  const { t } = useTranslation();
  const [data, setData] = useState<PrefeituraKpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros — defaults: últimos 30 dias.
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
      const result = await prefeituraApi.getKpis(f, tParam);
      setData(result);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      setError(raw.includes('NO_ORGAN_CONTEXT') ? t('prefeitura.errors.noOrgan') : t('prefeitura.errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchKpis(defaultFrom, defaultTo);
    // Só rodar uma vez no mount — filtro subsequente é via form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e: FormEvent) {
    e.preventDefault();
    fetchKpis(from, to);
  }

  const compliance = data ? `${data.globalComplianceRate.toFixed(1)}%` : '—';
  const period = data
    ? `${formatDate(data.from)} → ${formatDate(data.to)}`
    : t('prefeitura.kpis.periodPlaceholder');

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

      {loading && !data && <div className={styles.loading}>{t('prefeitura.common.loading')}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {data && (
        <>
          {/* ── Hero ── */}
          <section className={styles.hero}>
            <div>
              <div className={styles.heroLabel}>{t('prefeitura.kpis.heroLabel')}</div>
              <div className={styles.heroValue}>{compliance}</div>
              <div className={styles.heroSub}>{t('prefeitura.kpis.heroSub')}</div>
            </div>
            <div className={styles.heroPeriod}>{period}</div>
          </section>

          {/* ── Grid de KPIs ── */}
          <section className={styles.grid} aria-label={t('prefeitura.kpis.gridAriaLabel')}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>{t('prefeitura.kpis.cardExpected')}</div>
              <div className={styles.cardValue}>{data.totalExpectedShifts}</div>
              <div className={styles.cardSub}>{t('prefeitura.kpis.cardExpectedSub')}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>{t('prefeitura.kpis.cardCovered')}</div>
              <div className={styles.cardValue}>{data.totalCoveredShifts}</div>
              <div className={styles.cardSub}>{t('prefeitura.kpis.cardCoveredSub')}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>{t('prefeitura.kpis.cardAbsences')}</div>
              <div className={styles.cardValue}>{data.totalAbsences}</div>
              <div className={styles.cardSub}>{t('prefeitura.kpis.cardAbsencesSub')}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>{t('prefeitura.kpis.cardLate')}</div>
              <div className={styles.cardValue}>{data.totalLateEvents}</div>
              <div className={styles.cardSub}>{t('prefeitura.kpis.cardLateSub')}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>{t('prefeitura.kpis.cardAvgLate')}</div>
              <div className={styles.cardValue}>{data.averageLateMinutes.toFixed(1)}</div>
              <div className={styles.cardSub}>{t('prefeitura.kpis.cardAvgLateSub')}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>{t('prefeitura.kpis.cardSubstitution')}</div>
              <div className={styles.cardValue}>{data.substitutionRate.toFixed(1)}%</div>
              <div className={styles.cardSub}>{t('prefeitura.kpis.cardSubstitutionSub')}</div>
            </div>
          </section>

          {/* ── Tabela por UPA ── */}
          <section className={styles.tableWrap}>
            <div className={styles.tableHeader}>
              <div className={styles.tableTitle}>{t('prefeitura.kpis.tableTitle')}</div>
            </div>
            {data.byClinic.length === 0 ? (
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
                    {data.byClinic.map((c) => (
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
