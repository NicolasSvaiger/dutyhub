import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { prefeituraApi, type PrefeituraAbsenceItem } from '../../api/prefeituraApi';
import styles from './PrefeituraShared.module.css';

/**
 * Sub-view "Ausências" do portal Prefeitura. getAbsences com type='absence'.
 * Cada linha tem botão "Acionar OS" que abre modal de confirmação e chama
 * notifyOs (backend cria Alert na OS). Após sucesso, mostra toast + recarrega
 * a lista pra remover o item que ficou "notificado".
 *
 * Nota: o backend valida idempotência via shiftId+userId no service, então
 * reload é seguro mesmo em race conditions.
 */
export function PrefeituraAusencias() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrefeituraAbsenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Modal state
  const [modalItem, setModalItem] = useState<PrefeituraAbsenceItem | null>(null);
  const [modalMessage, setModalMessage] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
      const result = await prefeituraApi.getAbsences(f, tp, 'absence');
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
      await prefeituraApi.downloadReport('ausencias', format, { from, to });
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

  function openNotifyModal(item: PrefeituraAbsenceItem) {
    setModalItem(item);
    setModalMessage('');
    setModalError(null);
  }

  function closeModal() {
    if (notifying) return; // Não fechar durante request
    setModalItem(null);
    setModalMessage('');
    setModalError(null);
  }

  async function confirmNotify() {
    if (!modalItem) return;
    setNotifying(true);
    setModalError(null);
    try {
      // Backend usa absence.id como shiftId (o service resolve internamente)
      await prefeituraApi.notifyOs(modalItem.id, modalItem.userId, modalMessage || undefined);
      // Marca como notificado localmente + toast
      setNotifiedIds((prev) => new Set(prev).add(modalItem.id));
      setToastMessage(t('prefeitura.ausencias.notifyOsSuccess', { name: modalItem.userName }));
      setModalItem(null);
      // Toast some depois de 5s
      window.setTimeout(() => setToastMessage(null), 5000);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      setModalError(raw || t('prefeitura.ausencias.notifyOsError'));
    } finally {
      setNotifying(false);
    }
  }

  return (
    <div className={styles.container}>
      <form className={styles.filters} onSubmit={handleFilter}>
        <div className={styles.filterGroup}>
          <label htmlFor="aus-from" className={styles.filterLabel}>
            {t('prefeitura.kpis.from')}
          </label>
          <input
            id="aus-from"
            type="date"
            className={styles.filterInput}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="aus-to" className={styles.filterLabel}>
            {t('prefeitura.kpis.to')}
          </label>
          <input
            id="aus-to"
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

      {toastMessage && (
        <div className={styles.toast} role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {toastMessage}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className={styles.loading}>{t('prefeitura.common.loading')}</div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className={styles.empty}>{t('prefeitura.ausencias.empty')}</div>
      )}

      {items.length > 0 && (
        <section className={styles.tableWrap}>
          <div className={styles.tableHeader}>
            <div className={styles.tableTitle}>{t('prefeitura.ausencias.tableTitle')}</div>
            <div className={styles.tableCount}>
              {t('prefeitura.ausencias.rowCount', { count: items.length })}
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('prefeitura.ausencias.user')}</th>
                  <th>{t('prefeitura.ausencias.clinic')}</th>
                  <th>{t('prefeitura.ausencias.date')}</th>
                  <th>{t('prefeitura.ausencias.shift')}</th>
                  <th>{t('prefeitura.ausencias.substitute')}</th>
                  <th>{t('prefeitura.ausencias.action')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const notified = notifiedIds.has(item.id);
                  return (
                    <tr key={item.id}>
                      <td>{item.userName}</td>
                      <td>{item.clinicName}</td>
                      <td>{formatDate(item.date)}</td>
                      <td>{item.shiftLabel}</td>
                      <td>
                        {item.substituteName ? (
                          <span className={`${styles.badge} ${styles.badgeGood}`}>
                            {item.substituteName}
                          </span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeMuted}`}>
                            {t('prefeitura.ausencias.noSubstitute')}
                          </span>
                        )}
                      </td>
                      <td>
                        {notified ? (
                          <span className={styles.actionDisabled}>
                            {t('prefeitura.ausencias.notified')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={styles.actionButton}
                            onClick={() => openNotifyModal(item)}
                          >
                            {t('prefeitura.ausencias.notifyOs')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Modal Acionar OS ── */}
      {modalItem && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="notify-modal-title"
          onClick={closeModal}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 id="notify-modal-title" className={styles.modalTitle}>
              {t('prefeitura.ausencias.notifyOsTitle')}
            </h2>
            <p className={styles.modalBody}>
              {t('prefeitura.ausencias.notifyOsConfirm', {
                name: modalItem.userName,
                clinic: modalItem.clinicName,
                date: formatDate(modalItem.date),
              })}
            </p>
            <textarea
              className={styles.modalTextarea}
              placeholder={t('prefeitura.ausencias.messagePlaceholder')}
              value={modalMessage}
              onChange={(e) => setModalMessage(e.target.value)}
              disabled={notifying}
              aria-label={t('prefeitura.ausencias.messageLabel')}
            />
            {modalError && <div className={styles.error} style={{ marginTop: '0.6rem' }}>{modalError}</div>}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={closeModal}
                disabled={notifying}
              >
                {t('prefeitura.ausencias.cancel')}
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={confirmNotify}
                disabled={notifying}
              >
                {notifying
                  ? t('prefeitura.ausencias.notifying')
                  : t('prefeitura.ausencias.confirmNotify')}
              </button>
            </div>
          </div>
        </div>
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
