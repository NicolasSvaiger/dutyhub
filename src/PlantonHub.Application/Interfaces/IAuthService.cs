using PlantonHub.Application.DTOs.Auth;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// [DEPRECATED - Sprint 2] Custom auth service — replaced by AWS Cognito.
/// Kept temporarily for backward compatibility during migration.
/// Will be removed once all environments use Cognito exclusively.
/// </summary>
[Obsolete("Use Cognito SDK for authentication. This service will be removed after Sprint 2 migration is complete.")]
public interface IAuthService
{
    Task<LoginResponse> LoginAsync(LoginRequest request);
    Task<RefreshTokenResponse> RefreshTokenAsync(RefreshTokenRequest request);
}
