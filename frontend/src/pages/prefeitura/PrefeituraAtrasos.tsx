import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraAbsenceItem } from '../../api/prefeituraApi';
import styles from './PrefeituraShared.module.css';

/**
 * Sub-view "Atrasos" do portal Prefeitura. getAbsences com type='late' —
 * lista atrasos (check-in acima da tolerância). Colunas: profissional,
 * clínica, data, plantão, minutos atrasado, justificado, substituto.
 */
export function PrefeituraAtrasos() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrefeituraAbsenceItem[]>([]);
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

  async function fetchData(f: string, tp: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await prefeituraApi.getAbsences(f, tp, 'late');
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
    fetchData(defaultFrom, defaultTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e: FormEvent) {
    e.preventDefault();
    fetchData(from, to);
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

  return (
    <div className={styles.container}>
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
        <div className={styles.filterActions}>
          <button type="submit" className={styles.filterButton} disabled={loading}>
            {loading ? t('prefeitura.common.loading') : t('prefeitura.kpis.apply')}
          </button>
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => handleExport('pdf')}
            disabled={exporting || items.length === 0}
          >
            {t('prefeitura.common.exportPdf')}
          </button>
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => handleExport('xlsx')}
            disabled={exporting || items.length === 0}
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
        <section className={styles.tableWrap}>
          <div className={styles.tableHeader}>
            <div className={styles.tableTitle}>{t('prefeitura.atrasos.tableTitle')}</div>
            <div className={styles.tableCount}>
              {t('prefeitura.atrasos.rowCount', { count: items.length })}
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('prefeitura.atrasos.user')}</th>
                  <th>{t('prefeitura.atrasos.clinic')}</th>
                  <th>{t('prefeitura.atrasos.date')}</th>
                  <th>{t('prefeitura.atrasos.shift')}</th>
                  <th>{t('prefeitura.atrasos.minutes')}</th>
                  <th>{t('prefeitura.atrasos.justified')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.userName}</td>
                    <td>{item.clinicName}</td>
                    <td>{formatDate(item.date)}</td>
                    <td>{item.shiftLabel}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          (item.minutesLate ?? 0) >= 30
                            ? styles.badgeBad
                            : styles.badgeWarn
                        }`}
                      >
                        {item.minutesLate ?? 0} min
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          item.justified ? styles.badgeGood : styles.badgeMuted
                        }`}
                      >
                        {item.justified
                          ? t('prefeitura.atrasos.yes')
                          : t('prefeitura.atrasos.no')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return iso;
  }
}
