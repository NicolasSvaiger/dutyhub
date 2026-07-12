namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Service for server-side Cognito authentication operations.
/// Uses CUSTOM_AUTH flow: after face verification succeeds, this service
/// authenticates the user via Cognito's custom challenge (HMAC-based, no passwords).
/// </summary>
public interface ICognitoAuthService
{
    /// <summary>
    /// Authenticate a user via Cognito CUSTOM_AUTH flow.
    /// Returns ID Token, Access Token, and Refresh Token.
    /// </summary>
    Task<CognitoAuthResult> AuthenticateAsync(string email);

    /// <summary>
    /// Ensure the user exists in Cognito (create if not).
    /// Called when a new professional is onboarded for face-login.
    /// No password is set — CUSTOM_AUTH flow doesn't require one.
    /// </summary>
    Task EnsureUserExistsAsync(string email);
}

public record CognitoAuthResult(
    string IdToken,
    string AccessToken,
    string RefreshToken,
    int ExpiresIn
);
