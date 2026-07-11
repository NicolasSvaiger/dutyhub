/**
 * Cognito authentication service.
 *
 * Wraps `amazon-cognito-identity-js` into a promise-based API that the rest
 * of the app can consume without knowing Cognito internals.
 */
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js';
import { COGNITO_CONFIG } from '../config/cognito';

// ─── Pool singleton (lazy — avoids crash when env vars are missing in tests) ──
let _userPool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool {
  if (!_userPool) {
    if (!COGNITO_CONFIG.userPoolId || !COGNITO_CONFIG.clientId) {
      throw new Error(
        'Cognito not configured: set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID',
      );
    }
    _userPool = new CognitoUserPool({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      ClientId: COGNITO_CONFIG.clientId,
    });
  }
  return _userPool;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

export interface CognitoAuthUser {
  userId: string;
  email: string;
  name: string | null;
  roles: string[];
  clinicId: string | null;
  clinicIds: string[];
}

/**
 * Challenges that may be returned during login (e.g. first-time password change).
 */
export type AuthChallenge = 'NEW_PASSWORD_REQUIRED' | 'MFA_REQUIRED';

export interface LoginResult {
  success: true;
  tokens: CognitoTokens;
  user: CognitoAuthUser;
}

export interface ChallengeResult {
  success: false;
  challenge: AuthChallenge;
  cognitoUser: CognitoUser;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractTokens(session: CognitoUserSession): CognitoTokens {
  return {
    idToken: session.getIdToken().getJwtToken(),
    accessToken: session.getAccessToken().getJwtToken(),
    refreshToken: session.getRefreshToken().getToken(),
  };
}

function parseUserFromSession(session: CognitoUserSession): CognitoAuthUser {
  const idPayload = session.getIdToken().decodePayload() as Record<string, unknown>;

  const userId = (idPayload['sub'] as string) ?? '';
  const email = (idPayload['email'] as string) ?? '';
  const name = (idPayload['name'] as string) ?? (idPayload['given_name'] as string) ?? null;

  // Custom claims injected by pre-token-generation Lambda
  let roles: string[] = [];
  const rolesRaw = idPayload['roles'] ?? idPayload['custom:roles'];
  if (typeof rolesRaw === 'string') {
    try {
      roles = JSON.parse(rolesRaw) as string[];
    } catch {
      roles = rolesRaw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  } else if (Array.isArray(rolesRaw)) {
    roles = rolesRaw as string[];
  }

  // Cognito groups also represent roles
  const groups = (idPayload['cognito:groups'] as string[]) ?? [];
  if (groups.length > 0 && roles.length === 0) {
    roles = groups;
  }

  let clinicIds: string[] = [];
  const clinicIdsRaw = idPayload['clinicIds'] ?? idPayload['custom:clinicIds'];
  if (typeof clinicIdsRaw === 'string') {
    try {
      clinicIds = JSON.parse(clinicIdsRaw) as string[];
    } catch {
      clinicIds = clinicIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  } else if (Array.isArray(clinicIdsRaw)) {
    clinicIds = clinicIdsRaw as string[];
  }

  const clinicId = clinicIds[0] ?? null;

  return { userId, email, name, roles, clinicId, clinicIds };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Authenticate with email + password.
 * Returns tokens on success, or a challenge descriptor if Cognito requires
 * additional steps (e.g. force change password on first login).
 */
export function cognitoLogin(email: string, password: string): Promise<LoginResult | ChallengeResult> {
  const cognitoUser = new CognitoUser({
    Username: email,
    Pool: getUserPool(),
  });

  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess(session) {
        const tokens = extractTokens(session);
        const user = parseUserFromSession(session);
        resolve({ success: true, tokens, user });
      },
      onFailure(err) {
        reject(new Error(err.message || 'Authentication failed'));
      },
      newPasswordRequired() {
        resolve({ success: false, challenge: 'NEW_PASSWORD_REQUIRED', cognitoUser });
      },
      mfaRequired() {
        resolve({ success: false, challenge: 'MFA_REQUIRED', cognitoUser });
      },
    });
  });
}

/**
 * Complete a NEW_PASSWORD_REQUIRED challenge (first login after admin creates user).
 */
export function cognitoCompleteNewPassword(
  cognitoUser: CognitoUser,
  newPassword: string,
): Promise<LoginResult> {
  return new Promise((resolve, reject) => {
    cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess(session) {
        const tokens = extractTokens(session);
        const user = parseUserFromSession(session);
        resolve({ success: true, tokens, user });
      },
      onFailure(err) {
        reject(new Error(err.message || 'Failed to set new password'));
      },
    });
  });
}

/**
 * Refresh the session using the stored refresh token.
 * The Cognito SDK handles this automatically when calling getSession(),
 * but this explicit method is useful for the axios interceptor.
 */
export function cognitoRefreshSession(refreshToken: string): Promise<CognitoTokens> {
  const cognitoUser = getUserPool().getCurrentUser();
  if (!cognitoUser) {
    return Promise.reject(new Error('No current user'));
  }

  const token = new CognitoRefreshToken({ RefreshToken: refreshToken });

  return new Promise((resolve, reject) => {
    cognitoUser.refreshSession(token, (err, session: CognitoUserSession) => {
      if (err) {
        reject(new Error(err.message || 'Token refresh failed'));
        return;
      }
      resolve(extractTokens(session));
    });
  });
}

/**
 * Get the current valid session (refreshes automatically if expired).
 * Returns null if no user is signed in.
 */
export function cognitoGetCurrentSession(): Promise<{ tokens: CognitoTokens; user: CognitoAuthUser } | null> {
  const cognitoUser = getUserPool().getCurrentUser();
  if (!cognitoUser) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        // Session expired and couldn't be refreshed
        resolve(null);
        return;
      }
      const tokens = extractTokens(session);
      const user = parseUserFromSession(session);
      resolve({ tokens, user });
    });
  });
}

/**
 * Sign out the current user (local sign out — clears tokens from storage).
 */
export function cognitoLogout(): void {
  const cognitoUser = getUserPool().getCurrentUser();
  if (cognitoUser) {
    cognitoUser.signOut();
  }
}

/**
 * Global sign out — invalidates all sessions server-side.
 */
export function cognitoGlobalLogout(): Promise<void> {
  const cognitoUser = getUserPool().getCurrentUser();
  if (!cognitoUser) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    cognitoUser.getSession((err: Error | null) => {
      if (err) {
        // If we can't get session, just do local signout
        cognitoUser.signOut();
        resolve();
        return;
      }
      cognitoUser.globalSignOut({
        onSuccess() {
          resolve();
        },
        onFailure(err) {
          // Fall back to local signout
          cognitoUser.signOut();
          reject(new Error(err.message || 'Global sign out failed'));
        },
      });
    });
  });
}

/**
 * Initiate forgot-password flow (sends verification code to email).
 */
export function cognitoForgotPassword(email: string): Promise<void> {
  const cognitoUser = new CognitoUser({
    Username: email,
    Pool: getUserPool(),
  });

  return new Promise((resolve, reject) => {
    cognitoUser.forgotPassword({
      onSuccess() {
        resolve();
      },
      onFailure(err) {
        reject(new Error(err.message || 'Failed to initiate password reset'));
      },
      inputVerificationCode() {
        // Code sent successfully — resolve so the UI can show the code input form
        resolve();
      },
    });
  });
}

/**
 * Confirm a new password with the verification code from email.
 */
export function cognitoConfirmPassword(
  email: string,
  verificationCode: string,
  newPassword: string,
): Promise<void> {
  const cognitoUser = new CognitoUser({
    Username: email,
    Pool: getUserPool(),
  });

  return new Promise((resolve, reject) => {
    cognitoUser.confirmPassword(verificationCode, newPassword, {
      onSuccess() {
        resolve();
      },
      onFailure(err) {
        reject(new Error(err.message || 'Failed to confirm new password'));
      },
    });
  });
}
