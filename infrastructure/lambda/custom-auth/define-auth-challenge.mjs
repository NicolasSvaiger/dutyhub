/**
 * DefineAuthChallenge Lambda Trigger
 *
 * Called by Cognito to determine what auth challenge to issue next.
 * Flow:
 *  - First call (no prior sessions): issue CUSTOM_CHALLENGE
 *  - After successful challenge response: mark authenticated
 *  - After failed attempt: fail auth
 */
export async function handler(event) {
  const session = event.request.session;

  if (session.length === 0) {
    // First call: issue a custom challenge
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = "CUSTOM_CHALLENGE";
  } else if (
    session.length === 1 &&
    session[0].challengeName === "CUSTOM_CHALLENGE" &&
    session[0].challengeResult === true
  ) {
    // Challenge answered correctly: issue tokens
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
  } else {
    // Wrong answer or too many attempts: fail
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
  }

  return event;
}
