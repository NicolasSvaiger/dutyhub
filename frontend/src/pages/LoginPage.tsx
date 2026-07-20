import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { BRAND } from '../config/brand';
import { getHomeRouteFor } from '../config/roles';
import styles from './LoginPage.module.css';

/**
 * Tela de login do médico — layout de duas colunas (hero à esquerda, form à
 * direita) baseado no mock em `/public/originais/OS/admin-login.html`, mas
 * com paleta teal + laranja da área do médico. Em mobile o hero some e
 * apenas o form ocupa a tela.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { login, isAuthenticated, user, pendingChallenge, completeNewPassword } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Primeiro acesso: usuário convidado por admin recebe senha temporária e o
  // Cognito devolve o challenge NEW_PASSWORD_REQUIRED. Enquanto ele estiver
  // pendente, trocamos o formulário de login pela etapa "defina sua senha".
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const needsNewPassword = pendingChallenge === 'NEW_PASSWORD_REQUIRED';

  // Redirect quando já autenticado — em effect (nunca durante render).
  // A rota destino depende do role: profissional cai direto no /doctor;
  // admin cai em /dashboard. Ver config/roles.ts.
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getHomeRouteFor(user.roles), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      // O AuthContext atualiza `user` de forma síncrona depois de login();
      // se por algum motivo ainda estiver null aqui, o useEffect acima cobre
      // o redirect quando o state reagir.
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      // Traduz mensagens do Cognito para português
      if (raw.includes('Incorrect username or password') || raw.includes('NotAuthorizedException')) {
        setError(t('login.errorInvalidCredentials'));
      } else if (raw.includes('User does not exist') || raw.includes('UserNotFoundException')) {
        setError(t('login.errorInvalidCredentials'));
      } else if (raw.includes('Password attempts exceeded') || raw.includes('LimitExceededException')) {
        setError(t('login.errorTooManyAttempts'));
      } else if (raw.includes('User is not confirmed')) {
        setError(t('login.errorNotConfirmed'));
      } else {
        setError(raw || t('login.errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Regras espelham a passwordPolicy do User Pool (cognito-stack.ts):
    // mínimo 8, maiúscula, minúscula e dígito (símbolo não é exigido).
    if (newPassword.length < 8) {
      setError(t('login.errorPasswordTooShort'));
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError(t('login.errorPasswordNeedsUpper'));
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setError(t('login.errorPasswordNeedsLower'));
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError(t('login.errorPasswordNeedsNumber'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('login.errorPasswordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await completeNewPassword(newPassword);
      // Sucesso: o AuthContext popula `user` e o useEffect de redirect acima
      // leva o usuário para a home da sua role (getHomeRouteFor).
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('InvalidPasswordException')) {
        setError(t('login.passwordRules'));
      } else {
        setError(raw || t('login.errorSetPassword'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = () => {
    navigate('/forgot-password');
  };

  const isDark = theme === 'dark';

  return (
    <div className={styles.page}>
      {/* ══ Toggle claro/escuro (canto superior direito) ══ */}
      <button
        type="button"
        onClick={toggleTheme}
        className={styles.themeToggle}
        aria-label={isDark ? t('doctor.theme.toActivateLight') : t('doctor.theme.toActivateDark')}
        title={isDark ? t('doctor.theme.light') : t('doctor.theme.dark')}
      >
        {isDark ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      {/* ══ HERO ══ */}
      <aside className={styles.hero} aria-hidden="true">
        <div className={styles.heroMesh} />
        <div className={styles.heroDots} />
        <div className={styles.heroRing1} />
        <div className={styles.heroRing2} />

        <div className={styles.heroContent}>
          <div className={styles.heroLogo}>
            <svg
              className={styles.heroLogoIcon}
              viewBox="0 0 88 88"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="loginHeroGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,.35)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,.15)" />
                </linearGradient>
              </defs>
              <circle cx="44" cy="44" r="44" fill="url(#loginHeroGrad)" />
              <path
                d="M44 17 C33 17 24 26 24 37 C24 51 44 67 44 67 C44 67 64 51 64 37 C64 26 55 17 44 17Z"
                fill="rgba(255,255,255,.95)"
              />
              <polyline
                points="31,37 36,37 39,31 42,43 45,35 48,41 51,37 57,37"
                fill="none"
                stroke="#2DBFB8"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points="37,24 42,30 52,20"
                fill="none"
                stroke="#F5A623"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className={styles.heroLogoName}>{BRAND.name}</div>
            <div className={styles.heroLogoTag}>{t('login.heroTagline')}</div>
          </div>

          <div className={styles.heroModuleTag}>
            <div className={styles.moduleDot} />
            {t('login.eyebrow')}
          </div>

          <div className={styles.heroDivider} />

          <div className={styles.heroTitle}>{t('login.heroTitle')}</div>
          <div className={styles.heroSub}>{t('login.heroSub')}</div>

          <div className={styles.heroFeatures}>
            <div className={styles.heroFeat}>
              <span className={styles.featIcon}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              {t('login.feature1')}
            </div>
            <div className={styles.heroFeat}>
              <span className={styles.featIcon}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </span>
              {t('login.feature2')}
            </div>
            <div className={styles.heroFeat}>
              <span className={styles.featIcon}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17.5 19a4.5 4.5 0 0 0 0-9h-1.8A7 7 0 1 0 4 15.9" />
                  <line x1="8" y1="14" x2="8" y2="20" />
                  <polyline points="5 18 8 21 11 18" />
                </svg>
              </span>
              {t('login.feature3')}
            </div>
          </div>
        </div>
      </aside>

      {/* ══ FORM ══ */}
      <main className={styles.formSide}>
        <div className={styles.formBox}>
          <div className={styles.formHeader}>
            <div className={styles.formEyebrow}>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {t('login.eyebrow')}
            </div>
            <h1 className={styles.formTitle}>
              {needsNewPassword ? t('login.setPasswordTitle') : t('login.title')}
            </h1>
            <div className={styles.formSub}>
              {needsNewPassword ? t('login.setPasswordSubtitle') : t('login.subtitle')}
            </div>
          </div>

          {needsNewPassword ? (
            <form onSubmit={handleSetPassword} noValidate>
              <div className={styles.field}>
                <label htmlFor="newPassword" className={styles.fieldLabel}>
                  {t('login.newPasswordLabel')}
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`${styles.input} ${styles.inputPassword}`}
                    placeholder={t('login.passwordPlaceholder')}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={showNewPassword ? t('login.hidePassword') : t('login.showPassword')}
                    aria-pressed={showNewPassword}
                    tabIndex={0}
                  >
                    {showNewPassword ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.22-5.06" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="confirmPassword" className={styles.fieldLabel}>
                  {t('login.confirmPasswordLabel')}
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="confirmPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={styles.input}
                    placeholder={t('login.passwordPlaceholder')}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 16px' }}>
                {t('login.passwordRules')}
              </p>

              {error && (
                <div className={styles.errorBox} role="alert">
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
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className={styles.btnPrimary} disabled={loading}>
                {loading ? t('login.setPasswordSubmitting') : t('login.setPasswordSubmit')}
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.fieldLabel}>
                {t('login.emailLabel')}
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.input}
                  placeholder={t('login.emailPlaceholder')}
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className={styles.fieldLabel}>
                {t('login.passwordLabel')}
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${styles.input} ${styles.inputPassword}`}
                  placeholder={t('login.passwordPlaceholder')}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  aria-pressed={showPassword}
                  tabIndex={0}
                >
                  {showPassword ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.22-5.06" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
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
                onClick={handleForgot}
                disabled={loading}
              >
                {t('login.forgot')}
              </button>
            </div>

            {error && (
              <div className={styles.errorBox} role="alert">
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
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
          )}

          <div className={styles.formFooter}>
            © {new Date().getFullYear()} {BRAND.name}
          </div>
        </div>
      </main>
    </div>
  );
}
