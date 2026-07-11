import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import { DoctorHeader } from './DoctorHeader';
import { ReportsClinicPicker } from './ReportsClinicPicker';
import { DateField } from './DateField';
import { useReportStats } from './useReportStats';
import { useClinic } from '../../hooks/useClinic';
import { attendanceApi } from '../../api/attendanceApi';
import { formatDate } from './dateFormat';
import { formatTime } from './useClock';
import type { Attendance } from '../../types/index';

/**
 * Filters attendance records by date range [startDate, endDate] inclusive.
 * Exported for testability (Property 7).
 */
export function filterByDateRange(
  records: Attendance[],
  startDate: string | null,
  endDate: string | null
): Attendance[] {
  if (!startDate && !endDate) return records;

  return records.filter((record) => {
    const checkInDate = record.checkInTime.slice(0, 10);
    if (startDate && checkInDate < startDate) return false;
    if (endDate && checkInDate > endDate) return false;
    return true;
  });
}

/** Filters attendance records by clinicId. Exported for testability (Property 8). */
export function filterByClinic(
  records: Attendance[],
  clinicId: string | null
): Attendance[] {
  if (!clinicId) return records;
  return records.filter((record) => record.clinicId === clinicId);
}

export function DoctorReportsScreen() {
  const { t } = useTranslation();
  const { clinics } = useClinic();
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedClinicId, setSelectedClinicId] = useState<string>('');
  const [filteredRecords, setFilteredRecords] = useState<Attendance[]>([]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await attendanceApi.getMyHistory();
      const fetched = Array.isArray(data) ? data : [];
      setRecords(fetched);
      setFilteredRecords(fetched);
    } catch {
      setError(t('doctor.reports.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      <DoctorHeader />

      <div className={styles.relBody}>
        {loading && (
          <div className={styles.card}>
            <p className={styles.loadMsg}>{t('doctor.reports.loading')}</p>
          </div>
        )}

        {error && (
          <div className={styles.card}>
            <p
              role="alert"
              style={{
                fontSize: '.85rem',
                fontWeight: 700,
                color: 'var(--danger)',
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
              {t('doctor.reports.retry')}
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Stats Card */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>{t('doctor.reports.summary')}</div>
              <div className={styles.statsRow}>
                <div className={styles.statBox}>
                  <div className={styles.statNum}>{stats.totalShifts}</div>
                  <div className={styles.statLbl}>{t('doctor.reports.shifts')}</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statNum}>{stats.totalHours.toFixed(1)}</div>
                  <div className={styles.statLbl}>{t('doctor.reports.hours')}</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statNum}>{stats.avgHoursPerShift.toFixed(1)}</div>
                  <div className={styles.statLbl}>{t('doctor.reports.avgPerShift')}</div>
                </div>
              </div>
            </div>

            {/* Filter Card */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>{t('doctor.reports.filters')}</div>

              <div className={styles.filterLabel}>{t('doctor.reports.startDate')}</div>
              <DateField
                value={startDate}
                onChange={setStartDate}
                max={endDate || undefined}
                ariaLabel={t('doctor.reports.startDate')}
              />

              <div className={styles.filterLabel} style={{ marginTop: '.6rem' }}>
                {t('doctor.reports.endDate')}
              </div>
              <DateField
                value={endDate}
                onChange={setEndDate}
                min={startDate || undefined}
                ariaLabel={t('doctor.reports.endDate')}
              />

              <div className={styles.filterLabel} style={{ marginTop: '.6rem' }}>
                {t('doctor.reports.clinic')}
              </div>
              <ReportsClinicPicker
                clinics={clinics}
                value={selectedClinicId}
                onChange={setSelectedClinicId}
              />

              <button className={styles.btnBuscar} onClick={handleFilter}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {t('doctor.reports.search')}
              </button>
            </div>

            {/* Record List */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>{t('doctor.reports.records')}</div>
              <div className={styles.recordList}>
                {filteredRecords.length === 0 && (
                  <p style={{ fontSize: '.82rem', color: 'var(--muted)', textAlign: 'center' }}>
                    {t('doctor.reports.noRecords')}
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
                          {t('doctor.reports.entry')}: {formatTime(checkInDate)}
                          {hasCheckOut && ` • ${t('doctor.reports.exit')}: ${formatTime(new Date(record.checkOutTime!))}`}
                        </div>
                      </div>
                      <span
                        className={`${styles.badge} ${hasCheckOut ? styles.badgeOut : styles.badgeIn}`}
                      >
                        {hasCheckOut ? t('doctor.reports.badgeOut') : t('doctor.reports.badgeIn')}
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
