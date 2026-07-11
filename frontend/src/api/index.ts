// API layer - axios instance and API client modules
export { default as axiosInstance } from './axiosInstance';
export { clinicsApi } from './clinicsApi';
export { usersApi } from './usersApi';
export { shiftsApi } from './shiftsApi';
export { attendanceApi } from './attendanceApi';

// Cognito auth (Sprint 2 — primary auth mechanism)
export {
  cognitoLogin,
  cognitoLogout,
  cognitoGlobalLogout,
  cognitoRefreshSession,
  cognitoGetCurrentSession,
  cognitoForgotPassword,
  cognitoConfirmPassword,
  cognitoCompleteNewPassword,
} from './cognitoAuth';
export type { CognitoTokens, CognitoAuthUser, AuthChallenge } from './cognitoAuth';
