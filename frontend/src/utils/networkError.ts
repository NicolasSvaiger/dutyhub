/**
 * Determines if an error is a network-level error (no response from server)
 * or a server error (5xx) that should trigger retry queue enrollment.
 *
 * Network errors are identified by:
 * - axios errors without a response property (no connectivity)
 * - server errors with status >= 500 (server unavailable/failing)
 *
 * Business errors (4xx) are NOT network errors and should be shown to the user.
 */
export function isNetworkError(error: unknown): boolean {
  const err = error as {
    response?: { status?: number };
    code?: string;
    message?: string;
  };

  // No response at all = network error (offline, timeout, DNS failure, etc.)
  if (!err.response) {
    return true;
  }

  // Server errors (5xx) are treated as retryable network-like errors
  if (err.response.status && err.response.status >= 500) {
    return true;
  }

  return false;
}
