import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../i18n';

/**
 * Small icon button that opens a popover with the supported languages.
 * Changing the language calls i18n.changeLanguage which also persists to
 * localStorage (via i18next-browser-languagedetector's caches setting).
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Normalize the current language to one of the supported codes (e.g. 'pt-BR' → 'pt')
  const currentLang = (SUPPORTED_LANGUAGES.find((l) => i18n.language?.startsWith(l))
    ?? 'pt') as SupportedLanguage;

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

  const handleSelect = (lang: SupportedLanguage) => {
    void i18n.changeLanguage(lang);
    setOpen(false);
  };

  return (
    <div className={styles.langWrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.langButton}
        onClick={() => setOpen((v) => !v)}
        aria-label={t('language.switcher')}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('language.switcher')}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className={styles.langCode}>{currentLang.toUpperCase()}</span>
      </button>

      {open && (
        <ul className={styles.langList} role="listbox" aria-label={t('language.switcher')}>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isActive = lang === currentLang;
            return (
              <li key={lang} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`${styles.langItem} ${isActive ? styles.langItemActive : ''}`}
                  onClick={() => handleSelect(lang)}
                >
                  <span className={styles.langItemCode}>{lang.toUpperCase()}</span>
                  <span className={styles.langItemName}>{LANGUAGE_LABELS[lang]}</span>
                  {isActive && (
                    <svg
                      className={styles.langItemCheck}
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
