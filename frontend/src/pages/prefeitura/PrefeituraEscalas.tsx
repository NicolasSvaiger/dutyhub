import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  prefeituraApi,
  type PrefeituraShiftItem,
  type PrefeituraClinicItem,
} from '../../api/prefeituraApi';
import styles from './PrefeituraEscalas.module.css';

/**
 * Sub-view "Escalas" do portal Prefeitura. Filtros de período + UPA opcional +
 * grid de cards por plantão com clínica, horário, progress de check-ins e
 * assignments individuais (nomes + status). Loading/error/empty tratados;
 * NO_ORGAN_CONTEXT com mensagem específica.
 */
export function PrefeituraEscalas() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrefeituraShiftItem[]>([]);
  const [clinics, setClinics] = useState<PrefeituraClinicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const defaultFrom = today.toISOString().slice(0, 10);
  const defaultTo = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [clinicId, setClinicId] = useState('');

  async function fetchShifts(f: string, tp: string, c: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await prefeituraApi.getShifts(f, tp, c || undefined);
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
    // Carrega clínicas em paralelo pra popular o dropdown do filtro
    prefeituraApi
      .getClinics()
      .then(setClinics)
      .catch(() => {
        /* falha silenciosa — filtro fica sem clinics, mas view ainda funciona */
      });
    fetchShifts(defaultFrom, defaultTo, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e: FormEvent) {
    e.preventDefault();
    fetchShifts(from, to, clinicId);
  }

  return (
    <div className={styles.container}>
      {/* ── Filtros ── */}
      <form className={styles.filters} onSubmit={handleFilter}>
        <div className={styles.filterGroup}>
          <label htmlFor="escalas-from" className={styles.filterLabel}>
            {t('prefeitura.kpis.from')}
          </label>
          <input
            id="escalas-from"
            type="date"
            className={styles.filterInput}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="escalas-to" className={styles.filterLabel}>
            {t('prefeitura.kpis.to')}
          </label>
          <input
            id="escalas-to"
            type="date"
            className={styles.filterInput}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="escalas-clinic" className={styles.filterLabel}>
            {t('prefeitura.escalas.clinicLabel')}
          </label>
          <select
            id="escalas-clinic"
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
        <button type="submit" className={styles.filterButton} disabled={loading}>
          {loading ? t('prefeitura.common.loading') : t('prefeitura.kpis.apply')}
        </button>
      </form>

      {/* ── Estados ── */}
      {loading && items.length === 0 && (
        <div className={styles.loading}>{t('prefeitura.common.loading')}</div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className={styles.empty}>{t('prefeitura.escalas.empty')}</div>
      )}

      {/* ── Grid ── */}
      {items.length > 0 && (
        <div className={styles.grid}>
          {items.map((shift) => {
            const totalAssignees = shift.assignments.length;
            const percent =
              totalAssignees > 0 ? (shift.checkedInCount / totalAssignees) * 100 : 0;
            return (
              <div key={shift.shiftId} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>{shift.title}</div>
                  <div className={styles.cardDate}>{formatDate(shift.date)}</div>
                </div>
                <div className={styles.cardClinic}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                  {shift.clinicName}
                </div>
                <div className={styles.cardTime}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {shift.startTime} → {shift.endTime}
                </div>
                <div className={styles.progress}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${percent}%` }} />
                  </div>
                  <div className={styles.progressLabel}>
                    {shift.checkedInCount}/{totalAssignees}
                  </div>
                </div>
                {shift.assignments.length > 0 && (
                  <div className={styles.assignments}>
                    {shift.assignments.map((a) => (
                      <div key={a.userId} className={styles.assignment}>
                        <span>{a.userName}</span>
                        <span
                          className={`${styles.assignmentStatus} ${
                            a.hasCheckedIn ? styles.statusPresent : styles.statusPending
                          }`}
                        >
                          {a.hasCheckedIn
                            ? t('prefeitura.escalas.present')
                            : t('prefeitura.escalas.pending')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return iso;
  }
}
