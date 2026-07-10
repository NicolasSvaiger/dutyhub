import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DayPicker, type Matcher } from 'react-day-picker';
import { ptBR, enUS, es } from 'date-fns/locale';
import { addMonths, subMonths, addYears, subYears, isAfter, isBefore, endOfMonth, startOfMonth } from 'date-fns';
import 'react-day-picker/style.css';
import styles from './DoctorPage.module.css';

const LOCALE_MAP = {
  pt: ptBR,
  en: enUS,
  es,
} as const;

interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Campo de data com popover custom baseado no react-day-picker.
 * O header do calendário é renderizado manualmente para termos 4 setas:
 *   ««   navega 1 ano pra trás
 *    «   navega 1 mês pra trás
 *    »   navega 1 mês pra frente
 *   »»   navega 1 ano pra frente
 * O nome do mês/ano fica no centro. O DayPicker fica apenas com a grade
 * (nav e caption internos desabilitados via `hideNavigation` e `components`).
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  placeholder,
  ariaLabel,
}: DateFieldProps) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const langKey = (Object.keys(LOCALE_MAP) as Array<keyof typeof LOCALE_MAP>).find((k) =>
    i18n.language?.startsWith(k)
  ) ?? 'pt';
  const locale = LOCALE_MAP[langKey];

  const selectedDate = value ? isoToDate(value) : undefined;
  const minDate = min ? isoToDate(min) : undefined;
  const maxDate = max ? isoToDate(max) : undefined;

  const [visibleMonth, setVisibleMonth] = useState<Date>(selectedDate ?? new Date());

  // When opening the popover, jump to the currently-selected month
  useEffect(() => {
    if (open && selectedDate) {
      setVisibleMonth(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSelect = (date: Date | undefined) => {
    if (!date) {
      onChange('');
    } else {
      onChange(dateToIso(date));
    }
    setOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
  };

  const label = selectedDate
    ? new Intl.DateTimeFormat(i18n.language ?? 'pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(selectedDate)
    : (placeholder ?? t('doctor.reports.datePlaceholder'));

  const disabled: Matcher[] = [];
  if (minDate) disabled.push({ before: minDate });
  if (maxDate) disabled.push({ after: maxDate });

  // Whether the nav buttons should be disabled based on min/max bounds
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const canGoPrevMonth = !minDate || isAfter(monthStart, minDate);
  const canGoNextMonth = !maxDate || isBefore(monthEnd, maxDate);
  const prevYearMonth = subYears(visibleMonth, 1);
  const nextYearMonth = addYears(visibleMonth, 1);
  const canGoPrevYear = !minDate || isAfter(endOfMonth(prevYearMonth), minDate);
  const canGoNextYear = !maxDate || isBefore(startOfMonth(nextYearMonth), maxDate);

  const headerLabel = new Intl.DateTimeFormat(i18n.language ?? 'pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(visibleMonth);
  // Capitalize the first letter (Portuguese returns lowercase month)
  const headerLabelDisplay = headerLabel.charAt(0).toUpperCase() + headerLabel.slice(1);

  return (
    <div className={styles.dateFieldWrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.dateFieldTrigger}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span
          className={`${styles.dateFieldLabel} ${!selectedDate ? styles.dateFieldPlaceholder : ''}`}
        >
          {label}
        </span>
        {selectedDate && (
          <button
            type="button"
            className={styles.dateFieldClear}
            onClick={clear}
            aria-label={t('doctor.reports.clearDate')}
          >
            ✕
          </button>
        )}
      </button>

      {open && (
        <div className={styles.dateFieldPopover} role="dialog">
          {/* Custom header — 4 arrows + month/year label */}
          <div className={styles.dateFieldHeader}>
            <NavButton
              onClick={() => setVisibleMonth(subYears(visibleMonth, 1))}
              disabled={!canGoPrevYear}
              ariaLabel={t('doctor.reports.prevYear')}
              double
              direction="left"
            />
            <NavButton
              onClick={() => setVisibleMonth(subMonths(visibleMonth, 1))}
              disabled={!canGoPrevMonth}
              ariaLabel={t('doctor.reports.prevMonth')}
              direction="left"
            />
            <div className={styles.dateFieldHeaderLabel}>{headerLabelDisplay}</div>
            <NavButton
              onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
              disabled={!canGoNextMonth}
              ariaLabel={t('doctor.reports.nextMonth')}
              direction="right"
            />
            <NavButton
              onClick={() => setVisibleMonth(addYears(visibleMonth, 1))}
              disabled={!canGoNextYear}
              ariaLabel={t('doctor.reports.nextYear')}
              double
              direction="right"
            />
          </div>

          <DayPicker
            animate
            mode="single"
            month={visibleMonth}
            onMonthChange={setVisibleMonth}
            selected={selectedDate}
            onSelect={handleSelect}
            locale={locale}
            disabled={disabled}
            hideNavigation
            weekStartsOn={0}
            components={{
              MonthCaption: () => <></>,
            }}
          />
        </div>
      )}
    </div>
  );
}

interface NavButtonProps {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  direction: 'left' | 'right';
  double?: boolean;
}

/** Botão de navegação do calendário (uma ou duas setas). */
function NavButton({ onClick, disabled, ariaLabel, direction, double }: NavButtonProps) {
  return (
    <button
      type="button"
      className={styles.dateFieldNavBtn}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {direction === 'left' ? (
          double ? (
            <>
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </>
          ) : (
            <polyline points="15 18 9 12 15 6" />
          )
        ) : double ? (
          <>
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </>
        ) : (
          <polyline points="9 18 15 12 9 6" />
        )}
      </svg>
    </button>
  );
}

/** Converte "YYYY-MM-DD" para Date no fuso horário local (evita off-by-one). */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Converte Date para "YYYY-MM-DD" respeitando o fuso local. */
function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
