using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Http;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.Infrastructure.Services;

public class TenantService : ITenantService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public TenantService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? GetCurrentClinicId()
    {
        var claimValue = _httpContextAccessor.HttpContext?.User?.FindFirst("clinicId")?.Value;

        if (string.IsNullOrEmpty(claimValue))
            return null;

        return Guid.TryParse(claimValue, out var clinicId) ? clinicId : null;
    }

    public Guid? GetCurrentUserId()
    {
        var claimValue = _httpContextAccessor.HttpContext?.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                      ?? _httpContextAccessor.HttpContext?.User?.FindFirst("sub")?.Value;

        if (string.IsNullOrEmpty(claimValue))
            return null;

        return Guid.TryParse(claimValue, out var userId) ? userId : null;
    }

    public IEnumerable<string> GetCurrentRoles()
    {
        var claimValue = _httpContextAccessor.HttpContext?.User?.FindFirst("roles")?.Value;

        if (string.IsNullOrEmpty(claimValue))
            return Enumerable.Empty<string>();

        return claimValue.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    public bool IsAdminGlobal()
    {
        var roles = GetCurrentRoles();
        return roles.Contains("AdminGlobal", StringComparer.OrdinalIgnoreCase);
    }
}
