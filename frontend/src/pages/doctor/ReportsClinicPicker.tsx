import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import type { Clinic } from '../../types';

interface ReportsClinicPickerProps {
  clinics: Clinic[];
  /** Selected clinic id, or empty string for "all clinics". */
  value: string;
  onChange: (clinicId: string) => void;
  disabled?: boolean;
}

/**
 * Dropdown de filtro por clínica usado no relatório. Segue o mesmo visual
 * do ModalClinicPicker mas aceita a opção "Todas as unidades" (value = "").
 */
export function ReportsClinicPicker({
  clinics,
  value,
  onChange,
  disabled,
}: ReportsClinicPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const selected = clinics.find((c) => c.id === value);
  const label = selected?.name ?? t('doctor.reports.allClinics');

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className={styles.modalPicker} ref={wrapperRef}>
      <button
        type="button"
        className={styles.modalPickerTrigger}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
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
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 21V12h6v9" />
        </svg>
        <span className={styles.modalPickerLabel}>{label}</span>
        <svg
          className={`${styles.modalPickerChevron} ${open ? styles.modalPickerChevronOpen : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul className={styles.modalPickerList} role="listbox">
          <li role="none">
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              className={`${styles.modalPickerItem} ${value === '' ? styles.modalPickerItemActive : ''}`}
              onClick={() => handleSelect('')}
            >
              <span className={styles.modalPickerItemName}>{t('doctor.reports.allClinics')}</span>
              {value === '' && (
                <svg
                  className={styles.modalPickerItemCheck}
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="4,10 8,14 16,6" />
                </svg>
              )}
            </button>
          </li>
          {clinics.map((clinic) => {
            const isActive = clinic.id === value;
            return (
              <li key={clinic.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`${styles.modalPickerItem} ${isActive ? styles.modalPickerItemActive : ''}`}
                  onClick={() => handleSelect(clinic.id)}
                >
                  <span className={styles.modalPickerItemName}>{clinic.name}</span>
                  {isActive && (
                    <svg
                      className={styles.modalPickerItemCheck}
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="4,10 8,14 16,6" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
