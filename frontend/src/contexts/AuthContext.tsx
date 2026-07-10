import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi } from '../api/authApi';

// localStorage keys with prefix to avoid conflicts
const STORAGE_KEYS = {
  TOKEN: 'plantonhub_token',
  REFRESH_TOKEN: 'plantonhub_refresh_token',
  USER: 'plantonhub_user',
} as const;

export interface AuthUser {
  userId: string;
  email: string;
  name: string | null;
  roles: string[];
  /** Default clinic id embedded in the token (legacy single-clinic field). */
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
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeJwtPayload(token: string): AuthUser | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const payload = JSON.parse(jsonPayload) as Record<string, unknown>;

    // Extract claims - .NET JWT uses different claim types
    const userId =
      (payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] as string) ??
      (payload['sub'] as string) ??
      (payload['userId'] as string) ??
      '';

    const email =
      (payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] as string) ??
      (payload['email'] as string) ??
      '';

    const name =
      (payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] as string) ??
      (payload['name'] as string) ??
      (payload['given_name'] as string) ??
      null;

    // Roles can be a single string or array
    const roleClaim =
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ??
      payload['role'] ??
      payload['roles'] ??
      [];
    const roles = Array.isArray(roleClaim) ? (roleClaim as string[]) : [roleClaim as string];

    const clinicId = (payload['clinicId'] as string) ?? null;

    // Multi-clinic: comma-separated list of authorized clinic GUIDs
    const clinicIdsRaw = (payload['clinicIds'] as string) ?? '';
    const clinicIds = clinicIdsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return { userId, email, name, roles, clinicId, clinicIds };
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return true;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as Record<string, unknown>;
    const exp = payload['exp'] as number | undefined;

    if (!exp) return true;

    // Check if token expires within 30 seconds
    return Date.now() >= (exp * 1000) - 30000;
  } catch {
    return true;
  }
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem('plantonhub_active_clinic');
    setToken(null);
    setUser(null);
  }, []);

  const setAuthFromToken = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(STORAGE_KEYS.TOKEN, accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    setToken(accessToken);

    const decoded = decodeJwtPayload(accessToken);
    setUser(decoded);

    // Persist user profile data in localStorage
    if (decoded) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify({
        userId: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        roles: decoded.roles,
        clinicIds: decoded.clinicIds,
      }));
    }
  }, []);

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
      const storedRefreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

      if (!storedToken || !storedRefreshToken) {
        clearAuth();
        setLoading(false);
        return;
      }

      if (isTokenExpired(storedToken)) {
        // Try to refresh the token
        try {
          const response = await authApi.refreshToken(storedRefreshToken);
          setAuthFromToken(response.token, response.refreshToken);
        } catch {
          // Refresh token failed — clear all session data and redirect
          clearAuth();
        }
      } else {
        // Token is still valid — restore session from localStorage
        setToken(storedToken);
        const decoded = decodeJwtPayload(storedToken);
        setUser(decoded);
      }

      setLoading(false);
    };

    void initAuth();
  }, [clearAuth, setAuthFromToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await authApi.login(email, password);
      setAuthFromToken(response.token, response.refreshToken);
    },
    [setAuthFromToken]
  );

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    loading,
    login,
    logout,
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}
