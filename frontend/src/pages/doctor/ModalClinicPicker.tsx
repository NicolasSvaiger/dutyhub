import { useEffect, useRef, useState } from 'react';
import styles from './DoctorPage.module.css';
import type { Clinic } from '../../types';

interface ModalClinicPickerProps {
  clinics: Clinic[];
  activeClinic: Clinic | null;
  onSelect: (clinic: Clinic) => void;
  disabled?: boolean;
}

/**
 * Custom dropdown for selecting a clinic INSIDE a modal (light background).
 * Mirrors HeaderClinicPicker's behavior but with modal-appropriate styling.
 * Replaces the native <select> so we avoid the OS-specific ugly highlight
 * on the currently-selected option.
 */
export function ModalClinicPicker({
  clinics,
  activeClinic,
  onSelect,
  disabled,
}: ModalClinicPickerProps) {
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

  const handleSelect = (clinic: Clinic) => {
    onSelect(clinic);
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
        <span className={styles.modalPickerLabel}>
          {activeClinic?.name ?? 'Selecione uma clínica'}
        </span>
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
          {clinics.map((clinic) => {
            const isActive = clinic.id === activeClinic?.id;
            return (
              <li key={clinic.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`${styles.modalPickerItem} ${isActive ? styles.modalPickerItemActive : ''}`}
                  onClick={() => handleSelect(clinic)}
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
