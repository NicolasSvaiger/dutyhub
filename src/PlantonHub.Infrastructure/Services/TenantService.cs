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
            if (_resolvedUserIds.TryGetValue(sub, out var cached) && cached.expiresAt > DateTime.UtcNow)
                return cached.userId;

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
                        _resolvedUserIds[sub] = (user.Id, DateTime.UtcNow.Add(_cacheTtl));
                        return user.Id;
                    }
                }
            }

            // Fallback: trust the sub as user ID (backward compat)
            _resolvedUserIds[sub] = (directId, DateTime.UtcNow.Add(_cacheTtl));
            return directId;
        }

        return null;
    }

    // Cache sub → userId with TTL to avoid unbounded growth.
    // Entries expire after 10 minutes; stale entries are lazily evicted on access.
    private static readonly ConcurrentDictionary<string, (Guid userId, DateTime expiresAt)> _resolvedUserIds = new();
    private static readonly TimeSpan _cacheTtl = TimeSpan.FromMinutes(10);

    public IEnumerable<string> GetCurrentRoles()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        if (user is null) return Enumerable.Empty<string>();

        var roles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Source 1: "roles" custom claim (from pre-token-generation Lambda)
        var rolesClaim = user.FindFirst("roles")?.Value;
        if (!string.IsNullOrEmpty(rolesClaim))
        {
            // Support JSON array or CSV
            var raw = rolesClaim.Trim();
            if (raw.StartsWith('['))
            {
                try
                {
                    var parsed = System.Text.Json.JsonSerializer.Deserialize<string[]>(raw);
                    if (parsed is not null)
                        foreach (var r in parsed) roles.Add(r);
                }
                catch { /* fall through to CSV */ }
            }
            if (roles.Count == 0)
            {
                foreach (var r in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    roles.Add(r);
            }
        }

        // Source 2: "cognito:groups" claims (Cognito native groups)
        foreach (var claim in user.FindAll("cognito:groups"))
        {
            if (!string.IsNullOrEmpty(claim.Value))
                roles.Add(claim.Value);
        }

        return roles;
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

        // Fallback: if no clinicIds in token, resolve from DB via userId
        if (result.Count == 0)
        {
            var userId = GetCurrentUserId();
            if (userId.HasValue)
            {
                var httpContext = _httpContextAccessor.HttpContext;
                var userRepo = httpContext?.RequestServices.GetService<IUserRepository>();
                if (userRepo is not null)
                {
                    var email = httpContext!.User?.FindFirst("email")?.Value;
                    if (!string.IsNullOrEmpty(email))
                    {
                        var dbUser = userRepo.GetByEmailAsync(email).GetAwaiter().GetResult();
                        if (dbUser?.UserClinicRoles is not null)
                        {
                            foreach (var ucr in dbUser.UserClinicRoles)
                            {
                                result.Add(ucr.ClinicId);
                            }
                        }
                    }
                }
            }
        }

        return result;
    }

    /// <summary>
    /// AdminGlobal → always allowed.
    /// AdminClinica → allowed only when the target user shares at least one clinic
    /// with the caller. Uses the DB (via IUserRepository) as source of truth for
    /// the target user's clinic memberships — the caller's clinics still come
    /// from the JWT claim.
    /// </summary>
    public async Task<bool> CanOperateOnUserAsync(Guid targetUserId)
    {
        if (IsAdminGlobal()) return true;

        var authorized = GetAuthorizedClinicIdsSet();
        if (authorized.Count == 0) return false;

        var httpContext = _httpContextAccessor.HttpContext;
        var userRepo = httpContext?.RequestServices.GetService<IUserRepository>();
        if (userRepo is null) return false;

        var target = await userRepo.GetByIdAsync(targetUserId);
        if (target is null) return false;

        // Any overlap between caller's authorized clinics and target's clinic memberships
        foreach (var ucr in target.UserClinicRoles)
        {
            if (authorized.Contains(ucr.ClinicId)) return true;
        }

        return false;
    }
}
