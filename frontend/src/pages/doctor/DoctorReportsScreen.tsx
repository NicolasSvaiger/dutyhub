import { useState, useEffect, useCallback } from 'react';
import styles from './DoctorPage.module.css';
import { LogoHeader } from './icons';
import { useReportStats } from './useReportStats';
import { useClinic } from '../../hooks/useClinic';
import { attendanceApi } from '../../api/attendanceApi';
import { formatDate } from './DoctorCheckInConfirmScreen';
import { formatTime } from './useClock';
import type { Attendance } from '../../types/index';

/**
 * Filters attendance records by date range [startDate, endDate] inclusive.
 * Compares only the date portion of checkInTime (YYYY-MM-DD).
 * Exported for testability (Property 7).
 */
export function filterByDateRange(
  records: Attendance[],
  startDate: string | null,
  endDate: string | null
): Attendance[] {
  if (!startDate && !endDate) return records;

  return records.filter((record) => {
    const checkInDate = record.checkInTime.slice(0, 10); // YYYY-MM-DD
    if (startDate && checkInDate < startDate) return false;
    if (endDate && checkInDate > endDate) return false;
    return true;
  });
}

/**
 * Filters attendance records by clinicId.
 * Exported for testability (Property 8).
 */
export function filterByClinic(
  records: Attendance[],
  clinicId: string | null
): Attendance[] {
  if (!clinicId) return records;
  return records.filter((record) => record.clinicId === clinicId);
}

export function DoctorReportsScreen() {
  const { clinics } = useClinic();
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedClinicId, setSelectedClinicId] = useState<string>('');
  const [filteredRecords, setFilteredRecords] = useState<Attendance[]>([]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await attendanceApi.getMyHistory();
      setRecords(data);
      setFilteredRecords(data);
    } catch {
      setError('Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const stats = useReportStats(filteredRecords);

  const handleFilter = () => {
    let result = records;
    result = filterByDateRange(result, startDate || null, endDate || null);
    result = filterByClinic(result, selectedClinicId || null);
    setFilteredRecords(result);
  };

  return (
    <div className={`${styles.screen} ${styles.screenActive} ${styles.screenRelatorios}`}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderTop}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
            <LogoHeader size={44} />
            <div>
              <div className={styles.pageTitle}>Relatórios</div>
              <div className={styles.pageSubtitle}>Histórico de presenças</div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={styles.relBody}>
        {loading && (
          <div className={styles.card}>
            <p className={styles.loadMsg}>Carregando...</p>
          </div>
        )}

        {error && (
          <div className={styles.card}>
            <p
              role="alert"
              style={{
                fontSize: '.85rem',
                fontWeight: 700,
                color: '#e53e3e',
                textAlign: 'center',
              }}
            >
              {error}
            </p>
            <button
              className={styles.btnBuscar}
              onClick={fetchHistory}
              style={{ marginTop: '.6rem' }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Stats Card */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Resumo</div>
              <div className={styles.statsRow}>
                <div className={styles.statBox}>
                  <div className={styles.statNum}>{stats.totalShifts}</div>
                  <div className={styles.statLbl}>Plantões</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statNum}>{stats.totalHours.toFixed(1)}</div>
                  <div className={styles.statLbl}>Horas</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statNum}>{stats.avgHoursPerShift.toFixed(1)}</div>
                  <div className={styles.statLbl}>Média/Plantão</div>
                </div>
              </div>
            </div>

            {/* Filter Card */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Filtros</div>

              <div className={styles.filterLabel}>Data Início</div>
              <div className={styles.dateInputWrap}>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className={styles.filterLabel} style={{ marginTop: '.6rem' }}>
                Data Fim
              </div>
              <div className={styles.dateInputWrap}>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className={styles.filterLabel} style={{ marginTop: '.6rem' }}>
                Unidade
              </div>
              <div className={styles.customSelectWrap}>
                <select
                  value={selectedClinicId}
                  onChange={(e) => setSelectedClinicId(e.target.value)}
                >
                  <option value="">Todas as unidades</option>
                  {clinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
                <svg className={styles.selectArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              <button className={styles.btnBuscar} onClick={handleFilter}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Buscar
              </button>
            </div>

            {/* Record List */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Registros</div>
              <div className={styles.recordList}>
                {filteredRecords.length === 0 && (
                  <p style={{ fontSize: '.82rem', color: 'var(--muted)', textAlign: 'center' }}>
                    Nenhum registro encontrado
                  </p>
                )}
                {filteredRecords.map((record) => {
                  const checkInDate = new Date(record.checkInTime);
                  const hasCheckOut = !!record.checkOutTime;
                  return (
                    <div key={record.id} className={styles.recItem}>
                      <div className={styles.recLeft}>
                        <div className={styles.recDate}>{formatDate(checkInDate)}</div>
                        <div className={styles.recSub}>
                          Entrada: {formatTime(checkInDate)}
                          {hasCheckOut && ` • Saída: ${formatTime(new Date(record.checkOutTime!))}`}
                        </div>
                      </div>
                      <span
                        className={`${styles.badge} ${hasCheckOut ? styles.badgeOut : styles.badgeIn}`}
                      >
                        {hasCheckOut ? 'CHECK-OUT' : 'CHECK-IN'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
