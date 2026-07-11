using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Interfaces;

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
        var httpContext = _httpContextAccessor.HttpContext;
        if (httpContext is null) return null;

        // 1. Try 'sub' as direct GUID (legacy local JWT)
        var sub = httpContext.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
               ?? httpContext.User?.FindFirst("sub")?.Value;

        if (!string.IsNullOrEmpty(sub) && Guid.TryParse(sub, out var directId))
        {
            // Check if this GUID is a known user — if Cognito sub is a different UUID,
            // it won't match. Fall through to email-based resolution.
            if (_resolvedUserIds.TryGetValue(sub, out var cached))
                return cached;

            // Try resolving by looking up the user repository by email
            var email = httpContext.User?.FindFirst("email")?.Value
                     ?? httpContext.User?.FindFirst("username")?.Value;

            if (!string.IsNullOrEmpty(email))
            {
                var userRepo = httpContext.RequestServices.GetService<IUserRepository>();
                if (userRepo is not null)
                {
                    var user = userRepo.GetByEmailAsync(email).GetAwaiter().GetResult();
                    if (user is not null)
                    {
                        _resolvedUserIds[sub] = user.Id;
                        return user.Id;
                    }
                }
            }

            // Fallback: trust the sub as user ID (backward compat)
            _resolvedUserIds[sub] = directId;
            return directId;
        }

        return null;
    }

    // Cache sub → userId to avoid repeated DB lookups per request
    private static readonly ConcurrentDictionary<string, Guid> _resolvedUserIds = new();

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
            // Support both JSON array format (from Cognito Lambda) and CSV (legacy)
            var raw = multi.Trim();
            if (raw.StartsWith('['))
            {
                // JSON array: ["uuid1","uuid2"]
                try
                {
                    var parsed = System.Text.Json.JsonSerializer.Deserialize<string[]>(raw);
                    if (parsed is not null)
                    {
                        foreach (var item in parsed)
                        {
                            if (Guid.TryParse(item, out var id)) result.Add(id);
                        }
                    }
                }
                catch
                {
                    // Fallback to CSV parsing below
                }
            }

            if (result.Count == 0)
            {
                // CSV format: uuid1,uuid2
                foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    if (Guid.TryParse(part, out var id)) result.Add(id);
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
