using System.Security.Claims;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.Interfaces;

public interface IJwtTokenService
{
    string GenerateToken(User user, Guid clinicId, IEnumerable<RoleType> roles);
    ClaimsPrincipal? ValidateToken(string token);
}
