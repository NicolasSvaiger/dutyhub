import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import { DoctorHeader } from './DoctorHeader';
import { shiftsApi } from '../../api/shiftsApi';
import { useClinic } from '../../hooks/useClinic';
import { groupShifts, type ShiftBucket } from './shiftGrouping';
import { formatShiftTime } from './dateFormat';
import type { Shift } from '../../types';

/** Quantidade inicial de plantões passados / próximos exibidos antes de "Ver mais". */
const GROUP_INITIAL_LIMIT = 5;

export function DoctorShiftsScreen() {
  const { t, i18n } = useTranslation();
  const { resolveClinicName } = useClinic();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await shiftsApi.getMine();
        if (!cancelled) setShifts(data);
      } catch {
        if (!cancelled) setError(t('doctor.shifts.errorLoading'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const grouped = useMemo(() => groupShifts(shifts), [shifts]);

  const dateFormatter = new Intl.DateTimeFormat(i18n.language ?? 'pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    const raw = dateFormatter.format(dt);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  };

  return (
    <div className={`${styles.screen} ${styles.screenActive} ${styles.screenShifts}`}>
      <DoctorHeader />

      <div className={styles.shiftsBody}>
        {loading && (
          <div className={styles.card}>
            <p className={styles.loadMsg}>{t('doctor.shifts.loading')}</p>
          </div>
        )}

        {error && !loading && (
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
          </div>
        )}

        {!loading && !error && shifts.length === 0 && (
          <div className={styles.card}>
            <p
              style={{
                fontSize: '.85rem',
                fontWeight: 600,
                color: 'var(--muted)',
                textAlign: 'center',
              }}
            >
              {t('doctor.shifts.empty')}
            </p>
          </div>
        )}

        {!loading && !error && shifts.length > 0 && (
          <>
            <ShiftGroup
              bucket="today"
              title={t('doctor.shifts.today')}
              shifts={grouped.today}
              fmtDate={fmtDate}
              clinicName={resolveClinicName}
            />
            <ShiftGroup
              bucket="upcoming"
              title={t('doctor.shifts.upcoming')}
              shifts={grouped.upcoming}
              fmtDate={fmtDate}
              clinicName={resolveClinicName}
              collapsible
              initialLimit={GROUP_INITIAL_LIMIT}
            />
            <ShiftGroup
              bucket="past"
              title={t('doctor.shifts.past')}
              shifts={grouped.past}
              fmtDate={fmtDate}
              clinicName={resolveClinicName}
              collapsible
              initialLimit={GROUP_INITIAL_LIMIT}
            />
          </>
        )}
      </div>
    </div>
  );
}

interface ShiftGroupProps {
  bucket: ShiftBucket;
  title: string;
  shifts: Shift[];
  fmtDate: (iso: string) => string;
  clinicName: (clinicId: string) => string;
  /** Se true, mostra apenas `initialLimit` itens até o usuário clicar em "Ver mais". */
  collapsible?: boolean;
  initialLimit?: number;
}

function ShiftGroup({
  bucket,
  title,
  shifts,
  fmtDate,
  clinicName,
  collapsible,
  initialLimit = 10,
}: ShiftGroupProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (shifts.length === 0) return null;

  const shouldCollapse = !!collapsible && !expanded && shifts.length > initialLimit;
  const visibleShifts = shouldCollapse ? shifts.slice(0, initialLimit) : shifts;
  const hiddenCount = shifts.length - visibleShifts.length;

  return (
    <div className={styles.shiftGroup}>
      <div className={styles.shiftGroupTitle}>{title}</div>
      <div className={styles.shiftGroupList}>
        {visibleShifts.map((s) => (
          <div
            key={s.id}
            className={`${styles.shiftItem} ${bucket === 'today' ? styles.shiftItemToday : ''}`}
          >
            <div className={styles.shiftItemDate}>
              <div className={styles.shiftItemDay}>{fmtDate(s.date)}</div>
              <div className={styles.shiftItemHours}>
                {formatShiftTime(s.startTime)} – {formatShiftTime(s.endTime)}
              </div>
            </div>
            <div className={styles.shiftItemInfo}>
              <div className={styles.shiftItemTitle}>{s.title}</div>
              <div className={styles.shiftItemClinic}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                  <path d="M9 21V12h6v9" />
                </svg>
                {clinicName(s.clinicId)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {collapsible && shifts.length > initialLimit && (
        <button
          type="button"
          className={styles.shiftGroupExpandBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t('doctor.shifts.showLess')
            : t('doctor.shifts.showMore', { count: hiddenCount })}
        </button>
      )}
    </div>
  );
}
