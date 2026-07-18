import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { BRAND } from '../../config/brand';
import styles from './PrefeituraLoginPage.module.css';

/**
 * Login do portal Prefeitura — layout 2 colunas (hero + form) baseado no
 * mock <c>originais/Prefeitura/op-login.html</c>. Após autenticação:
 *   • Se o user tem role GestorPublico → redirect /prefeitura (ou /prefeitura/tv
 *     quando o query param ?tv=1 está presente, útil pra display de monitoramento).
 *   • Se tem outra role (admin, medico) → redirect pra home natural via
 *     getHomeRouteFor — o user consegue chegar aqui por engano e é
 *     encaminhado ao invés de ficar preso.
 *
 * MFA + refresh token são tratados pelo AuthContext + Cognito SDK; o
 * componente só coleta email/senha e delega ao login().
 */
export function PrefeituraLoginPage() {
  const { t } = useTranslation();
  const { login, isAuthenticated, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isTvMode = searchParams.get('tv') === '1';

  // Redirect quando autenticado. Gestor → /prefeitura (ou /prefeitura/tv);
  // outros roles → home natural do role (evita ficar preso).
  useEffect(() => {
    if (isAuthenticated && user) {
      const roles = user.roles ?? [];
      if (roles.includes('GestorPublico')) {
        navigate(isTvMode ? '/prefeitura/tv' : '/prefeitura', { replace: true });
      } else if (roles.includes('AdminGlobal') || roles.includes('AdminClinica')) {
        navigate('/admin', { replace: true });
      } else if (roles.length > 0) {
        navigate('/doctor', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate, isTvMode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('Incorrect username or password') || raw.includes('NotAuthorizedException')) {
        setError(t('prefeitura.login.errorInvalidCredentials'));
      } else if (raw.includes('User does not exist') || raw.includes('UserNotFoundException')) {
        setError(t('prefeitura.login.errorInvalidCredentials'));
      } else if (raw.includes('Password attempts exceeded') || raw.includes('LimitExceededException')) {
        setError(t('prefeitura.login.errorTooManyAttempts'));
      } else {
        setError(raw || t('prefeitura.login.errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className={styles.page}>
      <button
        type="button"
        onClick={toggleTheme}
        className={styles.themeToggle}
        aria-label={isDark ? t('doctor.theme.toActivateLight') : t('doctor.theme.toActivateDark')}
        title={isDark ? t('doctor.theme.light') : t('doctor.theme.dark')}
      >
        {isDark ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      {/* ══ HERO — esconde em mobile ══ */}
      <aside className={styles.hero} aria-hidden="true">
        <div className={styles.heroDots} />
        <div className={styles.heroContent}>
          <div className={styles.heroLogoName}>{BRAND.name}</div>
          <div className={styles.heroLogoTag}>{t('prefeitura.login.heroTagline')}</div>
          <div className={styles.heroDivider} />
          <div className={styles.heroTitle}>{t('prefeitura.login.heroTitle')}</div>
          <div className={styles.heroSub}>{t('prefeitura.login.heroSub')}</div>

          <div className={styles.heroBadges}>
            <div className={styles.heroBadge}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              {t('prefeitura.login.feature1')}
            </div>
            <div className={styles.heroBadge}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
              </svg>
              {t('prefeitura.login.feature2')}
            </div>
            <div className={styles.heroBadge}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {t('prefeitura.login.feature3')}
            </div>
          </div>
        </div>
      </aside>

      {/* ══ FORM ══ */}
      <main className={styles.formSide}>
        <div className={styles.formBox}>
          <div className={styles.formHeader}>
            <h1 className={styles.formTitle}>{t('prefeitura.login.title')}</h1>
            <div className={styles.formSub}>{t('prefeitura.login.subtitle')}</div>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="prefeitura-email" className={styles.fieldLabel}>
                {t('prefeitura.login.emailLabel')}
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </span>
                <input
                  id="prefeitura-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.input}
                  placeholder={t('prefeitura.login.emailPlaceholder')}
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="prefeitura-password" className={styles.fieldLabel}>
                {t('prefeitura.login.passwordLabel')}
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="prefeitura-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${styles.input} ${styles.inputPassword}`}
                  placeholder={t('prefeitura.login.passwordPlaceholder')}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('prefeitura.login.hidePassword') : t('prefeitura.login.showPassword')}
                  aria-pressed={showPassword}
                  tabIndex={0}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.22-5.06" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className={styles.forgotRow}>
              <button
                type="button"
                className={styles.forgotLink}
                onClick={() => navigate('/forgot-password?from=prefeitura')}
                disabled={loading}
              >
                {t('prefeitura.login.forgot')}
              </button>
            </div>

            {error && (
              <div className={styles.errorBox} role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? t('prefeitura.login.submitting') : t('prefeitura.login.submit')}
            </button>
          </form>

          <div className={styles.formFooter}>
            © {new Date().getFullYear()} {BRAND.name} · {t('prefeitura.login.footer')}
          </div>
        </div>
      </main>
    </div>
  );
}
