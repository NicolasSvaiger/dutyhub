import { timingSafeEqual } from "crypto";

/**
 * VerifyAuthChallenge Lambda Trigger
 *
 * Verifies the challenge answer from the backend.
 * The backend computes HMAC-SHA256(nonce, CUSTOM_AUTH_SECRET) and sends it as the answer.
 * We compare against the expectedAnswer computed in CreateAuthChallenge.
 *
 * This ensures only our backend (which knows the secret) can authenticate users
 * through this flow, without storing any per-user password.
 */
export async function handler(event) {
  const expectedAnswer = event.request.privateChallengeParameters.expectedAnswer;
  const userAnswer = event.request.challengeAnswer;

  // Validate inputs exist
  if (!expectedAnswer || !userAnswer) {
    event.response.answerCorrect = false;
    return event;
  }

  // Constant-time comparison to prevent timing attacks
  if (expectedAnswer.length !== userAnswer.length) {
    event.response.answerCorrect = false;
    return event;
  }

  event.response.answerCorrect = timingSafeEqual(
    Buffer.from(expectedAnswer, "utf8"),
    Buffer.from(userAnswer, "utf8")
  );

  return event;
}
