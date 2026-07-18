import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  prefeituraApi,
  type PrefeituraFrequencyItem,
  type PrefeituraClinicItem,
} from '../../api/prefeituraApi';
import styles from './PrefeituraShared.module.css';

/**
 * Sub-view "Frequência" do portal Prefeitura. Filtros de período + UPA
 * opcional + tabela com dia/clinic/expected/actual/presenceRate colorizada
 * por faixa (helper rateClass). Botões exportar PDF/XLSX via downloadReport.
 */
export function PrefeituraFrequencia() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrefeituraFrequencyItem[]>([]);
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

  async function fetchData(f: string, tp: string, c: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await prefeituraApi.getFrequency(f, tp, c || undefined);
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
        <div className={styles.empty}>{t('prefeitura.frequencia.empty')}</div>
      )}

      {items.length > 0 && (
        <section className={styles.tableWrap}>
          <div className={styles.tableHeader}>
            <div className={styles.tableTitle}>{t('prefeitura.frequencia.tableTitle')}</div>
            <div className={styles.tableCount}>
              {t('prefeitura.frequencia.rowCount', { count: items.length })}
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('prefeitura.frequencia.date')}</th>
                  <th>{t('prefeitura.frequencia.clinic')}</th>
                  <th>{t('prefeitura.frequencia.expected')}</th>
                  <th>{t('prefeitura.frequencia.actual')}</th>
                  <th>{t('prefeitura.frequencia.presenceRate')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={`${item.clinicId}-${item.date}-${idx}`}>
                    <td>{formatDate(item.date)}</td>
                    <td>{item.clinicName}</td>
                    <td>{item.expected}</td>
                    <td>{item.actual}</td>
                    <td className={rateClass(item.presenceRate, styles)}>
                      {item.presenceRate.toFixed(1)}%
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

function rateClass(rate: number, s: Record<string, string>): string {
  if (rate >= 90) return s.rateGood;
  if (rate >= 70) return s.rateWarn;
  return s.rateBad;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return iso;
  }
}
