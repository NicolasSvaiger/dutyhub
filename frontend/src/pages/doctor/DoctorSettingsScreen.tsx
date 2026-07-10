import { useTranslation } from 'react-i18next';
import styles from './DoctorPage.module.css';
import { DoctorHeader } from './DoctorHeader';
import { useTheme } from '../../hooks/useTheme';
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../../i18n';

interface DoctorSettingsScreenProps {
  onLogoutRequest: () => void;
}

/**
 * Tela de configurações do médico: aparência (tema), idioma e conta (sair).
 * Substitui os botões dispersos no header por um lugar único e organizado
 * — segue o padrão de "Configurações" que apps móveis costumam ter.
 */
export function DoctorSettingsScreen({ onLogoutRequest }: DoctorSettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const currentLang = (SUPPORTED_LANGUAGES.find((l) => i18n.language?.startsWith(l))
    ?? 'pt') as SupportedLanguage;

  return (
    <div className={`${styles.screen} ${styles.screenActive} ${styles.screenSettings}`}>
      <DoctorHeader />

      <div className={styles.settingsBody}>
        {/* ── APARÊNCIA ── */}
        <div className={styles.settingsSection}>
          <div className={styles.settingsSectionTitle}>
            {t('doctor.settings.appearance')}
          </div>
          <div className={styles.settingsCard}>
            <div className={styles.settingsRow}>
              <div className={styles.settingsRowIcon} aria-hidden="true">
                {theme === 'dark' ? '🌙' : '☀️'}
              </div>
              <div className={styles.settingsRowText}>
                <div className={styles.settingsRowLabel}>
                  {t('doctor.settings.theme')}
                </div>
                <div className={styles.settingsRowHint}>
                  {theme === 'dark' ? t('doctor.theme.dark') : t('doctor.theme.light')}
                </div>
              </div>
              <div
                className={styles.settingsSegmented}
                role="radiogroup"
                aria-label={t('doctor.settings.theme')}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === 'light'}
                  className={`${styles.settingsSegBtn} ${theme === 'light' ? styles.settingsSegBtnActive : ''}`}
                  onClick={() => setTheme('light')}
                >
                  {t('doctor.theme.light')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === 'dark'}
                  className={`${styles.settingsSegBtn} ${theme === 'dark' ? styles.settingsSegBtnActive : ''}`}
                  onClick={() => setTheme('dark')}
                >
                  {t('doctor.theme.dark')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── IDIOMA ── */}
        <div className={styles.settingsSection}>
          <div className={styles.settingsSectionTitle}>
            {t('doctor.settings.language')}
          </div>
          <div className={styles.settingsCard}>
            {SUPPORTED_LANGUAGES.map((lang, idx) => {
              const isActive = lang === currentLang;
              return (
                <button
                  key={lang}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={`${styles.settingsRow} ${styles.settingsRowClickable} ${idx > 0 ? styles.settingsRowBordered : ''}`}
                  onClick={() => void i18n.changeLanguage(lang)}
                >
                  <div className={styles.settingsRowFlag} aria-hidden="true">
                    {lang.toUpperCase()}
                  </div>
                  <div className={styles.settingsRowText}>
                    <div className={styles.settingsRowLabel}>
                      {LANGUAGE_LABELS[lang]}
                    </div>
                  </div>
                  {isActive && (
                    <svg
                      className={styles.settingsRowCheck}
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
              );
            })}
          </div>
        </div>

        {/* ── CONTA ── */}
        <div className={styles.settingsSection}>
          <div className={styles.settingsSectionTitle}>
            {t('doctor.settings.account')}
          </div>
          <div className={styles.settingsCard}>
            <button
              type="button"
              className={`${styles.settingsRow} ${styles.settingsRowClickable} ${styles.settingsRowDanger}`}
              onClick={onLogoutRequest}
            >
              <div className={styles.settingsRowIcon} aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10" />
                  <polyline points="20 17 23 12 20 7" />
                  <line x1="23" y1="12" x2="9" y2="12" />
                </svg>
              </div>
              <div className={styles.settingsRowText}>
                <div className={styles.settingsRowLabel}>
                  {t('doctor.nav.logout')}
                </div>
                <div className={styles.settingsRowHint}>
                  {t('doctor.settings.logoutHint')}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
