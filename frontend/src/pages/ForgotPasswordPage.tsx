import { useState, type FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cognitoForgotPassword, cognitoConfirmPassword } from '../api/cognitoAuth';
import styles from './LoginPage.module.css';
import fpStyles from './ForgotPasswordPage.module.css';

type Step = 'request' | 'confirm' | 'done';

// ─── Shared style overrides (glassmorphism card, always dark) ──────────────────

const FORM_SIDE_OVERRIDE: React.CSSProperties = {
  background: 'transparent',
  justifyContent: 'center',
};

const CARD_OVERRIDE: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.25)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '20px',
  padding: '1.8rem 1.4rem',
  color: 'rgba(255, 255, 255, 0.9)',
};

const TITLE_COLOR: React.CSSProperties = { color: 'rgba(255, 255, 255, 0.95)' };
const SUB_COLOR: React.CSSProperties = { color: 'rgba(255, 255, 255, 0.7)' };
const LABEL_COLOR: React.CSSProperties = { color: 'rgba(255, 255, 255, 0.7)' };

const INPUT_OVERRIDE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.15)',
  borderColor: 'rgba(255, 255, 255, 0.35)',
  color: '#fff',
  paddingLeft: '1rem',
};

const EYE_BTN_STYLE: React.CSSProperties = {
  position: 'absolute',
  right: '0.7rem',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
  padding: '0.3rem',
  display: 'flex',
  alignItems: 'center',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function PasswordCheck({ met, label }: { met: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
      <span style={{ color: met ? '#4ade80' : 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
        {met ? '✓' : '○'}
      </span>
      <span style={{ color: met ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)', fontSize: '0.72rem' }}>
        {label}
      </span>
    </div>
  );
}

const EYE_OPEN = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EYE_CLOSED = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.22-5.06" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

function EyeToggle({ visible, onToggle, t }: { visible: boolean; onToggle: () => void; t: (k: string) => string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? t('login.hidePassword') : t('login.showPassword')}
      style={EYE_BTN_STYLE}
    >
      {visible ? EYE_CLOSED : EYE_OPEN}
    </button>
  );
}

// ─── Cognito error mapping ─────────────────────────────────────────────────────

function mapForgotPasswordError(raw: string, t: (k: string) => string): string {
  if (raw.includes('username') || raw.includes('validation')) return t('forgotPassword.invalidEmail');
  if (raw.includes('UserNotFoundException') || raw.includes('not found')) return t('forgotPassword.userNotFound');
  if (raw.includes('LimitExceededException') || raw.includes('limit')) return t('forgotPassword.tooManyAttempts');
  return raw || t('forgotPassword.errorGeneric');
}

function mapConfirmPasswordError(raw: string, t: (k: string) => string): string {
  if (raw.includes('CodeMismatchException') || raw.includes('Invalid verification')) return t('forgotPassword.invalidCode');
  if (raw.includes('ExpiredCodeException') || raw.includes('expired')) return t('forgotPassword.expiredCode');
  if (raw.includes('InvalidPasswordException') || raw.includes('password')) return t('forgotPassword.passwordPolicy');
  if (raw.includes('LimitExceededException')) return t('forgotPassword.tooManyAttempts');
  return raw || t('forgotPassword.errorGeneric');
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get('from') === 'admin';
  const loginRoute = isAdmin ? '/admin/login' : '/login';

  // Dynamic gradient based on context
  const pageOverride: React.CSSProperties = {
    gridTemplateColumns: '1fr',
    background: isAdmin
      ? 'linear-gradient(150deg, #1e1b4b 0%, #4338ca 40%, #6366f1 70%, #2DBFB8 100%)'
      : 'linear-gradient(150deg, var(--teal-dark) 0%, var(--teal) 45%, var(--orange) 100%)',
  };

  const btnOverride: React.CSSProperties | undefined = isAdmin
    ? { background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 50%, #8b5cf6 100%)', boxShadow: '0 4px 14px rgba(99, 102, 241, .35)' }
    : undefined;

  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError(t('forgotPassword.emailRequired'));
      return;
    }

    setLoading(true);
    try {
      await cognitoForgotPassword(email.trim());
      setStep('confirm');
    } catch (err: unknown) {
      setError(mapForgotPasswordError(err instanceof Error ? err.message : '', t));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code.trim()) { setError(t('forgotPassword.codeRequired')); return; }
    if (!newPassword) { setError(t('forgotPassword.passwordRequired')); return; }
    if (newPassword.length < 8) { setError(t('forgotPassword.passwordTooShort')); return; }
    if (!/[A-Z]/.test(newPassword)) { setError(t('forgotPassword.passwordNeedsUpper')); return; }
    if (!/[a-z]/.test(newPassword)) { setError(t('forgotPassword.passwordNeedsLower')); return; }
    if (!/\d/.test(newPassword)) { setError(t('forgotPassword.passwordNeedsNumber')); return; }
    if (newPassword !== confirmPwd) { setError(t('forgotPassword.passwordMismatch')); return; }

    setLoading(true);
    try {
      await cognitoConfirmPassword(email, code.trim(), newPassword);
      setStep('done');
    } catch (err: unknown) {
      setError(mapConfirmPasswordError(err instanceof Error ? err.message : '', t));
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = `${styles.input} ${fpStyles.input}`;

  // ─── Done step ─────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className={styles.page} style={pageOverride}>
        <main className={styles.formSide} style={FORM_SIDE_OVERRIDE}>
          <div className={styles.formBox} style={CARD_OVERRIDE}>
            <div className={styles.formHeader}>
              <h1 className={styles.formTitle} style={TITLE_COLOR}>{t('forgotPassword.doneTitle')}</h1>
              <div className={styles.formSub} style={SUB_COLOR}>{t('forgotPassword.doneSub')}</div>
            </div>
            <button type="button" className={styles.btnPrimary} style={btnOverride} onClick={() => navigate(loginRoute, { replace: true })}>
              {t('forgotPassword.backToLogin')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ─── Request & Confirm steps ───────────────────────────────────────────────

  return (
    <div className={styles.page} style={pageOverride}>
      <main className={styles.formSide} style={FORM_SIDE_OVERRIDE}>
        <div className={styles.formBox} style={CARD_OVERRIDE}>
          <div className={styles.formHeader}>
            <h1 className={styles.formTitle} style={TITLE_COLOR}>
              {step === 'request' ? t('forgotPassword.title') : t('forgotPassword.confirmTitle')}
            </h1>
            <div className={styles.formSub} style={SUB_COLOR}>
              {step === 'request' ? t('forgotPassword.subtitle') : t('forgotPassword.confirmSubtitle')}
            </div>
          </div>

          {/* ── Step: request code ── */}
          {step === 'request' && (
            <form onSubmit={handleRequestCode} noValidate>
              <div className={styles.field}>
                <label htmlFor="forgot-email" className={styles.fieldLabel} style={LABEL_COLOR}>
                  {t('login.emailLabel')}
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClasses}
                    style={INPUT_OVERRIDE}
                    placeholder={t('login.emailPlaceholder')}
                    autoComplete="email"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {error && <div className={styles.errorBox} role="alert"><span>{error}</span></div>}

              <button type="submit" className={styles.btnPrimary} style={btnOverride} disabled={loading}>
                {loading ? t('forgotPassword.sending') : t('forgotPassword.sendCode')}
              </button>
            </form>
          )}

          {/* ── Step: confirm new password ── */}
          {step === 'confirm' && (
            <form onSubmit={handleConfirmReset} noValidate>
              <div className={styles.field}>
                <label htmlFor="verify-code" className={styles.fieldLabel} style={LABEL_COLOR}>
                  {t('forgotPassword.codeLabel')}
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="verify-code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className={inputClasses}
                    style={INPUT_OVERRIDE}
                    placeholder="123456"
                    autoComplete="one-time-code"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="new-password" className={styles.fieldLabel} style={LABEL_COLOR}>
                  {t('forgotPassword.newPasswordLabel')}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClasses}
                    style={{ ...INPUT_OVERRIDE, paddingRight: '2.8rem' }}
                    placeholder={t('forgotPassword.newPasswordPlaceholder')}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                  <EyeToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} t={t} />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="confirm-password" className={styles.fieldLabel} style={LABEL_COLOR}>
                  {t('forgotPassword.confirmPasswordLabel')}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    className={inputClasses}
                    style={{ ...INPUT_OVERRIDE, paddingRight: '2.8rem' }}
                    placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                  <EyeToggle visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((v) => !v)} t={t} />
                </div>
              </div>

              {/* Password requirements checklist */}
              <div style={{ marginBottom: '1.1rem', fontSize: '0.72rem', lineHeight: '1.6' }}>
                <PasswordCheck met={newPassword.length >= 8} label={t('forgotPassword.req8chars')} />
                <PasswordCheck met={/[A-Z]/.test(newPassword)} label={t('forgotPassword.reqUpper')} />
                <PasswordCheck met={/[a-z]/.test(newPassword)} label={t('forgotPassword.reqLower')} />
                <PasswordCheck met={/\d/.test(newPassword)} label={t('forgotPassword.reqNumber')} />
                {confirmPwd.length > 0 && (
                  <PasswordCheck met={newPassword === confirmPwd} label={t('forgotPassword.reqMatch')} />
                )}
              </div>

              {error && <div className={styles.errorBox} role="alert"><span>{error}</span></div>}

              <button type="submit" className={styles.btnPrimary} style={btnOverride} disabled={loading}>
                {loading ? t('forgotPassword.resetting') : t('forgotPassword.resetPassword')}
              </button>
            </form>
          )}

          <div className={styles.formFooter} style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: '1.2rem' }}>
            <Link to={loginRoute} style={{ color: 'rgba(255, 255, 255, 0.9)', textDecoration: 'none', fontWeight: 600 }}>
              ← {t('forgotPassword.backToLogin')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
