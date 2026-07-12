import { randomBytes, createHmac } from "crypto";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const smClient = new SecretsManagerClient({});
let cachedSecret = null;

/**
 * Retrieve the CUSTOM_AUTH_SECRET from Secrets Manager (cached across invocations).
 */
async function getSecret() {
  if (cachedSecret) return cachedSecret;

  // Allow direct env var for local testing
  if (process.env.CUSTOM_AUTH_SECRET) {
    cachedSecret = process.env.CUSTOM_AUTH_SECRET;
    return cachedSecret;
  }

  const secretArn = process.env.CUSTOM_AUTH_SECRET_ARN;
  if (!secretArn) throw new Error("CUSTOM_AUTH_SECRET_ARN not configured");

  const response = await smClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  // Secret is stored as plain string (not JSON)
  cachedSecret = response.SecretString;
  return cachedSecret;
}

/**
 * CreateAuthChallenge Lambda Trigger
 *
 * Generates a challenge for the CUSTOM_AUTH flow.
 * We generate a random nonce. The backend must respond with HMAC-SHA256(nonce, secret).
 * This proves the caller is our backend (which has the same secret), not an attacker.
 */
export async function handler(event) {
  const secret = await getSecret();

  // Generate a random challenge nonce
  const nonce = randomBytes(32).toString("hex");

  // Compute expected answer: HMAC-SHA256(nonce, secret)
  const expectedAnswer = createHmac("sha256", secret).update(nonce).digest("hex");

  // publicChallengeParameters is sent back to the caller (our backend)
  event.response.publicChallengeParameters = {
    nonce,
  };

  // privateChallengeParameters is only visible to VerifyAuthChallenge Lambda
  event.response.privateChallengeParameters = {
    expectedAnswer,
  };

  event.response.challengeMetadata = "BACKEND_AUTH_CHALLENGE";

  return event;
}
