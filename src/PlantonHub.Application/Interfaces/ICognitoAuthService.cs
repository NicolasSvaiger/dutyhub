namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Service for server-side Cognito authentication operations.
/// Used by face-login flow: after face verification succeeds, this service
/// authenticates the user via Cognito AdminInitiateAuth using a service-managed password.
/// </summary>
public interface ICognitoAuthService
{
    /// <summary>
    /// Authenticate a user via Cognito AdminInitiateAuth.
    /// Returns ID Token, Access Token, and Refresh Token.
    /// </summary>
    Task<CognitoAuthResult> AuthenticateAsync(string email);

    /// <summary>
    /// Set the service-managed password for a professional user.
    /// Called when a new professional is created or when migrating existing users.
    /// This password is never visible to the user — face verification is their auth factor.
    /// </summary>
    Task SetServicePasswordAsync(string email);
}

public record CognitoAuthResult(
    string IdToken,
    string AccessToken,
    string RefreshToken,
    int ExpiresIn
);
