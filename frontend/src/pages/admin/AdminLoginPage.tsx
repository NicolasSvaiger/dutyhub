import { useEffect, useState, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { BRAND } from '../../config/brand';
import { cognitoSendMfaCode } from '../../api/cognitoAuth';
import styles from './AdminLoginPage.module.css';

type Step = 'credentials' | 'mfa';

/**
 * Tela de login do Admin OS — layout split com paleta indigo/purple.
 * Suporta MFA via TOTP (app autenticador) quando configurado no Cognito.
 */
export function AdminLoginPage() {
  const { login, isAuthenticated, user, pendingChallenge, challengeUser, clearChallenge } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // MFA state
  const [mfaCode, setMfaCode] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect admin autenticado
  useEffect(() => {
    if (isAuthenticated && user) {
      const roles = user.roles ?? [];
      const isAdmin = roles.includes('AdminGlobal') || roles.includes('AdminClinica');
      if (isAdmin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  // Detect MFA challenge from AuthContext
  useEffect(() => {
    if (pendingChallenge === 'MFA_REQUIRED' && challengeUser) {
      setStep('mfa');
      setError(null);
    }
  }, [pendingChallenge, challengeUser]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      // If MFA is needed, the AuthContext sets pendingChallenge and the useEffect above catches it.
      // If no MFA, the user state updates and the redirect useEffect fires.
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('Incorrect username or password') || raw.includes('NotAuthorizedException')) {
        setError('Credenciais inválidas. Verifique email e senha.');
      } else if (raw.includes('User does not exist') || raw.includes('UserNotFoundException')) {
        setError('Credenciais inválidas. Verifique email e senha.');
      } else if (raw.includes('Password attempts exceeded') || raw.includes('LimitExceededException')) {
        setError('Muitas tentativas. Aguarde alguns minutos.');
      } else {
        setError(raw || 'Erro ao fazer login. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const code = mfaCode.join('');
    if (code.length !== 6) {
      setError('Insira o código de 6 dígitos.');
      setLoading(false);
      return;
    }

    try {
      const result = await cognitoSendMfaCode(challengeUser!, code);
      // Store tokens manually since we bypassed the normal login flow
      localStorage.setItem('plantonhub_token', result.tokens.idToken);
      localStorage.setItem('plantonhub_refresh_token', result.tokens.refreshToken);
      localStorage.setItem('plantonhub_user', JSON.stringify(result.user));
      clearChallenge();
      // Force page reload to pick up new auth state
      window.location.href = '/admin';
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('Invalid') || raw.includes('CodeMismatch')) {
        setError('Código inválido. Verifique e tente novamente.');
      } else {
        setError(raw || 'Erro ao verificar código.');
      }
      setMfaCode(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...mfaCode];
    newCode[index] = value.slice(-1);
    setMfaCode(newCode);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !mfaCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setMfaCode(pasted.split(''));
      otpRefs.current[5]?.focus();
      e.preventDefault();
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className={styles.page}>
      <button
        type="button"
        onClick={toggleTheme}
        className={styles.themeToggle}
        aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      >
        {isDark ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg className={styles.heroLogoIcon} viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
              <defs><linearGradient id="adminHeroGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="rgba(255,255,255,.35)" /><stop offset="100%" stopColor="rgba(255,255,255,.15)" /></linearGradient></defs>
              <circle cx="44" cy="44" r="44" fill="url(#adminHeroGrad)" />
              <path d="M44 18 L62 28 L62 44 C62 56 53 64 44 68 C35 64 26 56 26 44 L26 28 Z" fill="rgba(255,255,255,.95)" />
              <path d="M37 44 L42 49 L53 38" fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className={styles.heroLogoName}>{BRAND.name}</div>
            <div className={styles.heroLogoTag}>Gestão de Operações</div>
          </div>
          <div className={styles.heroModuleTag}><div className={styles.moduleDot} />Painel Administrativo</div>
          <div className={styles.heroDivider} />
          <div className={styles.heroTitle}>Gestão inteligente{'\n'}de plantões</div>
          <div className={styles.heroSub}>Monitore profissionais, gerencie escalas e acompanhe indicadores em tempo real.</div>
          <div className={styles.heroFeatures}>
            <div className={styles.heroFeat}><span className={styles.featIcon}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></span>Gestão de profissionais e escalas</div>
            <div className={styles.heroFeat}><span className={styles.featIcon}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg></span>Monitoramento em tempo real</div>
            <div className={styles.heroFeat}><span className={styles.featIcon}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg></span>Relatórios e faturamento</div>
          </div>
        </div>
      </aside>

      {/* ══ FORM ══ */}
      <main className={styles.formSide}>
        <div className={styles.formBox}>

          {/* STEP 1: Credentials */}
          {step === 'credentials' && (
            <>
              <div className={styles.formHeader}>
                <div className={styles.formEyebrow}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  Acesso Administrativo
                </div>
                <h1 className={styles.formTitle}>Entrar no painel</h1>
                <div className={styles.formSub}>Gerencie sua operação de plantões</div>
              </div>
              <form onSubmit={handleSubmit} noValidate>
                <div className={styles.field}>
                  <label htmlFor="admin-email" className={styles.fieldLabel}>Email corporativo</label>
                  <div className={styles.inputWrap}>
                    <span className={styles.inputIcon}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg></span>
                    <input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} placeholder="admin@empresa.com" autoComplete="email" required disabled={loading} />
                  </div>
                </div>
                <div className={styles.field}>
                  <label htmlFor="admin-password" className={styles.fieldLabel}>Senha</label>
                  <div className={styles.inputWrap}>
                    <span className={styles.inputIcon}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
                    <input id="admin-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`${styles.input} ${styles.inputPassword}`} placeholder="••••••••" autoComplete="current-password" required disabled={loading} />
                    <button type="button" className={styles.eyeBtn} onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} tabIndex={0}>
                      {showPassword ? (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.22-5.06" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>) : (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>)}
                    </button>
                  </div>
                </div>
                <div className={styles.forgotRow}>
                  <button type="button" className={styles.forgotLink} onClick={() => navigate('/forgot-password?from=admin')} disabled={loading}>Esqueceu a senha?</button>
                </div>
                {error && (<div className={styles.errorBox} role="alert"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg><span>{error}</span></div>)}
                <button type="submit" className={styles.btnPrimary} disabled={loading}>{loading ? 'Entrando...' : 'Acessar painel'}</button>
              </form>
            </>
          )}

          {/* STEP 2: MFA */}
          {step === 'mfa' && (
            <>
              <div className={styles.formHeader}>
                <div className={styles.formEyebrow}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  Verificação em 2 etapas
                </div>
                <h1 className={styles.formTitle}>Confirme sua identidade</h1>
                <div className={styles.formSub}>Insira o código do seu app autenticador</div>
              </div>
              <div className={styles.mfaInfo}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                <div><strong>Autenticação de dois fatores</strong><br />Use Google Authenticator ou outro app TOTP para obter o código de 6 dígitos.</div>
              </div>
              <form onSubmit={handleMfaSubmit} noValidate>
                <div className={styles.otpWrap} onPaste={handleOtpPaste}>
                  {mfaCode.map((digit, i) => (
                    <input key={i} ref={(el) => { otpRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(i, e)} className={`${styles.otpInput} ${digit ? styles.otpFilled : ''}`} disabled={loading} autoFocus={i === 0} />
                  ))}
                </div>
                {error && (<div className={styles.errorBox} role="alert"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg><span>{error}</span></div>)}
                <button type="submit" className={styles.btnPrimary} disabled={loading}>{loading ? 'Verificando...' : 'Verificar código'}</button>
                <button type="button" className={styles.btnGhost} onClick={() => { setStep('credentials'); setError(null); setMfaCode(['', '', '', '', '', '']); clearChallenge(); }} disabled={loading}>← Voltar ao login</button>
              </form>
            </>
          )}

          <div className={styles.formFooter}>© {new Date().getFullYear()} {BRAND.name} — Painel Administrativo</div>
        </div>
      </main>
    </div>
  );
}
