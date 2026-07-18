import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraHistoryPage } from '../../api/prefeituraApi';
import styles from './PrefeituraShared.module.css';

/**
 * Sub-view "Histórico" do portal Prefeitura. getHistory paginado com filtros
 * de período + tipo + busca livre. Lista com timestamp, tipo (ícone), título,
 * detalhes, profissional e clínica. Paginação next/prev + total.
 * Botão export PDF/XLSX aplicando os mesmos filtros.
 */
export function PrefeituraHistorico() {
  const { t } = useTranslation();
  const [data, setData] = useState<PrefeituraHistoryPage | null>(null);
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
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  async function fetchData(f: string, tp: string, ty: string, sq: string, pg: number) {
    setLoading(true);
    setError(null);
    try {
      const result = await prefeituraApi.getHistory(
        f,
        tp,
        ty || undefined,
        sq || undefined,
        pg,
        PAGE_SIZE,
      );
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

  useEffect(() => {
    fetchData(defaultFrom, defaultTo, '', '', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchData(from, to, typeFilter, search, 1);
  }

  function goToPage(next: number) {
    if (!data) return;
    if (next < 1 || next > data.totalPages) return;
    setPage(next);
    fetchData(from, to, typeFilter, search, next);
  }

  async function handleExport(format: 'pdf' | 'xlsx') {
    setExporting(true);
    try {
      await prefeituraApi.downloadReport('history', format, {
        from,
        to,
        filter: typeFilter || undefined,
        search: search || undefined,
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
      <form className={styles.filters} onSubmit={handleFilter}>
        <div className={styles.filterGroup}>
          <label htmlFor="hist-from" className={styles.filterLabel}>
            {t('prefeitura.kpis.from')}
          </label>
          <input
            id="hist-from"
            type="date"
            className={styles.filterInput}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="hist-to" className={styles.filterLabel}>
            {t('prefeitura.kpis.to')}
          </label>
          <input
            id="hist-to"
            type="date"
            className={styles.filterInput}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="hist-type" className={styles.filterLabel}>
            {t('prefeitura.historico.type')}
          </label>
          <select
            id="hist-type"
            className={styles.filterSelect}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">{t('prefeitura.historico.allTypes')}</option>
            <option value="checkin">{t('prefeitura.historico.typeCheckin')}</option>
            <option value="absence">{t('prefeitura.historico.typeAbsence')}</option>
            <option value="substitution">{t('prefeitura.historico.typeSubstitution')}</option>
            <option value="alert">{t('prefeitura.historico.typeAlert')}</option>
            <option value="justification">{t('prefeitura.historico.typeJustification')}</option>
          </select>
        </div>
        <div className={`${styles.filterGroup} ${styles.filterGroupWide}`}>
          <label htmlFor="hist-search" className={styles.filterLabel}>
            {t('prefeitura.historico.search')}
          </label>
          <input
            id="hist-search"
            type="search"
            className={styles.filterInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('prefeitura.historico.searchPlaceholder')}
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
            disabled={exporting || !data || data.items.length === 0}
          >
            {t('prefeitura.common.exportPdf')}
          </button>
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => handleExport('xlsx')}
            disabled={exporting || !data || data.items.length === 0}
          >
            {t('prefeitura.common.exportXlsx')}
          </button>
        </div>
      </form>

      {loading && !data && <div className={styles.loading}>{t('prefeitura.common.loading')}</div>}
      {error && <div className={styles.error}>{error}</div>}
      {!loading && !error && data && data.items.length === 0 && (
        <div className={styles.empty}>{t('prefeitura.historico.empty')}</div>
      )}

      {data && data.items.length > 0 && (
        <section className={styles.tableWrap}>
          <div className={styles.tableHeader}>
            <div className={styles.tableTitle}>{t('prefeitura.historico.tableTitle')}</div>
            <div className={styles.tableCount}>
              {t('prefeitura.historico.totalCount', { count: data.totalCount })}
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('prefeitura.historico.when')}</th>
                  <th>{t('prefeitura.historico.typeCol')}</th>
                  <th>{t('prefeitura.historico.event')}</th>
                  <th>{t('prefeitura.historico.user')}</th>
                  <th>{t('prefeitura.historico.clinic')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, idx) => (
                  <tr key={`${item.timestamp}-${idx}`}>
                    <td>{formatDateTime(item.timestamp)}</td>
                    <td>
                      <span className={`${styles.badge} ${typeBadgeClass(item.type, styles)}`}>
                        {t(`prefeitura.historico.type${capitalize(item.type)}`, item.type)}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{item.title}</div>
                      {item.details && (
                        <div style={{ fontSize: '0.75rem', color: '#7a9090', marginTop: 2 }}>
                          {item.details}
                        </div>
                      )}
                    </td>
                    <td>{item.userName ?? '—'}</td>
                    <td>{item.clinicName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.pagination}>
            <div className={styles.pageInfo}>
              {t('prefeitura.historico.pageInfo', {
                page: data.page,
                totalPages: data.totalPages,
              })}
            </div>
            <div className={styles.pageButtons}>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || loading}
              >
                {t('prefeitura.historico.prev')}
              </button>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => goToPage(page + 1)}
                disabled={page >= data.totalPages || loading}
              >
                {t('prefeitura.historico.next')}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function typeBadgeClass(type: string, s: Record<string, string>): string {
  switch (type.toLowerCase()) {
    case 'checkin':
      return s.badgeGood;
    case 'absence':
    case 'alert':
      return s.badgeBad;
    case 'substitution':
      return s.badgeWarn;
    default:
      return s.badgeMuted;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
