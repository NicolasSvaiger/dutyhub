/**
 * AWS Cognito configuration.
 *
 * Values come from environment variables set at build time (Vite).
 * In development, defaults point to a local/placeholder User Pool.
 * In production, set them in .env.production or CI secrets.
 */
export const COGNITO_CONFIG = {
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
  region: import.meta.env.VITE_COGNITO_REGION as string || 'us-east-1',
} as const;
