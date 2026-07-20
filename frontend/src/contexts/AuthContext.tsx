import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  cognitoLogin,
  cognitoCompleteNewPassword,
  cognitoGetCurrentSession,
  cognitoLogout,
  type CognitoAuthUser,
  type CognitoTokens,
  type AuthChallenge,
} from '../api/cognitoAuth';
import type { CognitoUser } from 'amazon-cognito-identity-js';

// localStorage keys with prefix to avoid conflicts
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'plantonhub_token',
  REFRESH_TOKEN: 'plantonhub_refresh_token',
  USER: 'plantonhub_user',
} as const;

export interface AuthUser {
  userId: string;
  email: string;
  name: string | null;
  roles: string[];
  /** Default clinic id (first in the list). */
  clinicId: string | null;
  /** All clinic ids the user is authorized to operate on. */
  clinicIds: string[];
}

export interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Non-null when login returned a challenge (NEW_PASSWORD_REQUIRED, etc.) */
  pendingChallenge: AuthChallenge | null;
  /** The CognitoUser handle needed to complete a challenge */
  challengeUser: CognitoUser | null;
  /**
   * Complete the NEW_PASSWORD_REQUIRED challenge (first login after an admin
   * invite). On success the user is fully authenticated, exactly as if
   * login() had succeeded, so the caller's post-login redirect fires.
   */
  completeNewPassword: (newPassword: string) => Promise<void>;
  /** Clear a pending challenge (e.g. after completing it) */
  clearChallenge: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function persistTokens(tokens: CognitoTokens): void {
  // Store ID token as Bearer (contains roles/clinicIds claims)
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.idToken);
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
}

function persistUser(user: AuthUser): void {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify({
    userId: user.userId,
    email: user.email,
    name: user.name,
    roles: user.roles,
    clinicIds: user.clinicIds,
  }));
}

function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem('plantonhub_active_clinic');
}

function cognitoUserToAuthUser(cu: CognitoAuthUser): AuthUser {
  return {
    userId: cu.userId,
    email: cu.email,
    name: cu.name,
    roles: cu.roles,
    clinicId: cu.clinicId,
    clinicIds: cu.clinicIds,
  };
}

// ─── Provider ──────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingChallenge, setPendingChallenge] = useState<AuthChallenge | null>(null);
  const [challengeUser, setChallengeUser] = useState<CognitoUser | null>(null);

  const clearAuth = useCallback(() => {
    clearStorage();
    cognitoLogout();
    setToken(null);
    setUser(null);
    setPendingChallenge(null);
    setChallengeUser(null);
  }, []);

  const setAuthFromCognito = useCallback((tokens: CognitoTokens, authUser: CognitoAuthUser) => {
    const mappedUser = cognitoUserToAuthUser(authUser);
    persistTokens(tokens);
    persistUser(mappedUser);
    // Use ID token as Bearer — it contains custom claims (roles, clinicIds)
    // injected by the pre-token-generation Lambda that the backend needs.
    setToken(tokens.idToken);
    setUser(mappedUser);
  }, []);

  // Initialize auth state — cognitoGetCurrentSession() handles refresh internally
  useEffect(() => {
    const initAuth = async () => {
      try {
        const session = await cognitoGetCurrentSession();
        if (session) {
          setAuthFromCognito(session.tokens, session.user);
        } else {
          clearAuth();
        }
      } catch {
        clearAuth();
      } finally {
        setLoading(false);
      }
    };

    void initAuth();
  }, [clearAuth, setAuthFromCognito]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await cognitoLogin(email, password);

      if (result.success) {
        setAuthFromCognito(result.tokens, result.user);
        setPendingChallenge(null);
        setChallengeUser(null);
      } else {
        // Challenge required (e.g. force change password on first login)
        setPendingChallenge(result.challenge);
        setChallengeUser(result.cognitoUser);
      }
    },
    [setAuthFromCognito],
  );

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const completeNewPassword = useCallback(
    async (newPassword: string) => {
      if (!challengeUser) {
        throw new Error('Nenhuma troca de senha pendente. Faça login novamente.');
      }
      const result = await cognitoCompleteNewPassword(challengeUser, newPassword);
      // Fully authenticated now — mirror the success branch of login() so the
      // caller's redirect (getHomeRouteFor) fires just like a normal sign-in.
      setAuthFromCognito(result.tokens, result.user);
      setPendingChallenge(null);
      setChallengeUser(null);
    },
    [challengeUser, setAuthFromCognito],
  );

  const clearChallenge = useCallback(() => {
    setPendingChallenge(null);
    setChallengeUser(null);
  }, []);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    loading,
    login,
    logout,
    pendingChallenge,
    challengeUser,
    completeNewPassword,
    clearChallenge,
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}
