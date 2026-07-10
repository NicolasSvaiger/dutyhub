import { useEffect, useRef, useState } from 'react';
import styles from './DoctorPage.module.css';
import type { Clinic } from '../../types';

interface HeaderClinicPickerProps {
  clinics: Clinic[];
  activeClinic: Clinic | null;
  onSelect: (clinic: Clinic) => void;
}

/**
 * Custom dropdown for switching the active clinic in the doctor header.
 * Built as a fully custom control (button + popover) so the styling can
 * match the app instead of relying on the browser's <select> popup.
 */
export function HeaderClinicPicker({ clinics, activeClinic, onSelect }: HeaderClinicPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on click outside
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
    <div className={styles.clinicPicker} ref={wrapperRef}>
      <button
        type="button"
        className={styles.clinicPickerTrigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={styles.clinicPickerLabel}>
          {activeClinic?.name ?? 'Selecione uma clínica'}
        </span>
        <svg
          className={`${styles.clinicPickerChevron} ${open ? styles.clinicPickerChevronOpen : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="5,8 10,13 15,8" />
        </svg>
      </button>

      {open && (
        <ul className={styles.clinicPickerList} role="listbox">
          {clinics.map((clinic) => {
            const isActive = clinic.id === activeClinic?.id;
            return (
              <li key={clinic.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`${styles.clinicPickerItem} ${isActive ? styles.clinicPickerItemActive : ''}`}
                  onClick={() => handleSelect(clinic)}
                >
                  <span className={styles.clinicPickerItemName}>{clinic.name}</span>
                  {isActive && (
                    <svg
                      className={styles.clinicPickerItemCheck}
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
