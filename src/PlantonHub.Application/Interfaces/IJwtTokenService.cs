using System.Security.Claims;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// [DEPRECATED - Sprint 2] Custom JWT generation — replaced by AWS Cognito token issuance.
/// Kept temporarily for backward compatibility during migration.
/// </summary>
[Obsolete("Cognito now issues JWTs. This service will be removed after Sprint 2 migration is complete.")]
public interface IJwtTokenService
{
    string GenerateToken(User user, Guid clinicId, IEnumerable<RoleType> roles);
    ClaimsPrincipal? ValidateToken(string token);
}
