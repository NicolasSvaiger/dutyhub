namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Service that issues and validates short-lived biometric proof tokens.
/// After a successful face verification (/api/biometric/verify), a proof token is issued
/// and cached in Redis. The check-in endpoint consumes (validates + deletes) the token
/// to confirm that biometric verification actually happened server-side.
/// This prevents spoofing of the BiometricValidated flag by modified apps.
/// </summary>
public interface IBiometricProofService
{
    /// <summary>
    /// Issue a proof token for the given user. Token is valid for 5 minutes and single-use.
    /// </summary>
    Task<string> IssueTokenAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Validate and consume a proof token. Returns true if valid (and deletes it).
    /// Returns false if token is expired, already used, or invalid.
    /// </summary>
    Task<bool> ValidateAndConsumeAsync(Guid userId, string token, CancellationToken ct = default);
}
