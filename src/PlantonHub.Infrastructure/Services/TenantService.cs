using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Http;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.Infrastructure.Services;

public class TenantService : ITenantService
{
    private const string ClinicHeaderName = "X-Clinic-Id";

    private readonly IHttpContextAccessor _httpContextAccessor;

    public TenantService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    /// <summary>
    /// Returns the active clinic id for the current request.
    /// Resolution order:
    ///   1. X-Clinic-Id request header (if present AND authorized in the token).
    ///   2. Legacy 'clinicId' claim from the JWT (default clinic).
    /// If the header is present but references a clinic the user is not
    /// authorized for, null is returned (caller must treat as unauthorized).
    /// </summary>
    public Guid? GetCurrentClinicId()
    {
        var httpContext = _httpContextAccessor.HttpContext;
        if (httpContext is null)
        {
            return null;
        }

        // 1. Try the request header first (multi-clinic scenario)
        if (httpContext.Request.Headers.TryGetValue(ClinicHeaderName, out var headerValue) &&
            Guid.TryParse(headerValue.ToString(), out var headerClinicId))
        {
            // Validate against the authorized clinicIds claim
            var authorized = GetAuthorizedClinicIdsSet();
            if (authorized.Contains(headerClinicId))
            {
                return headerClinicId;
            }

            // Header value is not authorized for this user — deny by returning null.
            return null;
        }

        // 2. Fall back to the legacy default 'clinicId' claim
        var claimValue = httpContext.User?.FindFirst("clinicId")?.Value;
        if (string.IsNullOrEmpty(claimValue))
        {
            return null;
        }

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

    /// <summary>
    /// Returns the set of clinic ids the current user is authorized to operate on,
    /// extracted from the 'clinicIds' claim (comma-separated GUIDs).
    /// Falls back to the single legacy 'clinicId' claim when 'clinicIds' is missing.
    /// </summary>
    public IEnumerable<Guid> GetAuthorizedClinicIds() => GetAuthorizedClinicIdsSet();

    private HashSet<Guid> GetAuthorizedClinicIdsSet()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        var result = new HashSet<Guid>();

        if (user is null)
        {
            return result;
        }

        var multi = user.FindFirst("clinicIds")?.Value;
        if (!string.IsNullOrEmpty(multi))
        {
            foreach (var part in multi.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (Guid.TryParse(part, out var id))
                {
                    result.Add(id);
                }
            }
        }

        // Also include the legacy default clinicId claim
        var legacy = user.FindFirst("clinicId")?.Value;
        if (!string.IsNullOrEmpty(legacy) && Guid.TryParse(legacy, out var legacyId))
        {
            result.Add(legacyId);
        }

        return result;
    }
}
