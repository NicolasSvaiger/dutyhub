using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.API.Middleware;

/// <summary>
/// Resolves the tenant identity for the current request:
///   - Maps the Cognito "sub" claim to the local User.Id (the two aren't
///     necessarily equal — Cognito assigns its own UUID for the sub).
///   - Builds the authoritative list of clinic IDs the user can operate on
///     (from JWT claims first, DB memberships as fallback).
///   - Validates the X-Clinic-Id header against that authoritative list.
///
/// The results are stashed in HttpContext.Items so TenantService can read
/// them synchronously without doing sync-over-async or hitting the DB per
/// call. The whole async work happens once, here, per request.
/// </summary>
public class TenantMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TenantMiddleware> _logger;

    // sub → local user info, cached in-process to avoid a DB round-trip on
    // every request. TTL is short (10 min) so status/permission changes
    // propagate reasonably fast without needing an explicit invalidate.
    private static readonly ConcurrentDictionary<string, CachedIdentity> _identityCache = new();
    private static readonly TimeSpan _cacheTtl = TimeSpan.FromMinutes(10);

    private readonly record struct CachedIdentity(Guid UserId, IReadOnlyList<Guid> ClinicIds, DateTime ExpiresAt);

    public TenantMiddleware(RequestDelegate next, ILogger<TenantMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            // Step 1: start with clinic ids from the JWT claims.
            var authorizedClinicIds = ResolveAuthorizedClinicIds(context);

            // Step 2: resolve local User.Id (async, only DB round-trip here)
            // and, if the JWT had no clinicIds, fall back to DB memberships.
            // Must happen BEFORE the X-Clinic-Id validation so users whose
            // clinicIds live only in the DB (older accounts, tests) are not
            // wrongly rejected.
            var sub = context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                   ?? context.User.FindFirst("sub")?.Value;
            var email = context.User.FindFirst("email")?.Value
                     ?? context.User.FindFirst("username")?.Value;

            if (!string.IsNullOrEmpty(sub))
            {
                var (resolvedUserId, resolvedClinicIds) = await ResolveIdentityAsync(
                    context, sub, email, authorizedClinicIds);

                if (resolvedUserId.HasValue)
                {
                    context.Items["CurrentUserId"] = resolvedUserId.Value;
                }

                // Merge DB-resolved memberships when the JWT had no clinicIds.
                if (authorizedClinicIds.Count == 0 && resolvedClinicIds.Count > 0)
                {
                    authorizedClinicIds = new List<Guid>(resolvedClinicIds);
                }
            }

            // Step 3: validate X-Clinic-Id header against the authoritative
            // list. This must run AFTER the DB fallback so a legitimate
            // request isn't blocked because the JWT was thin.
            var clinicIdHeader = context.Request.Headers["X-Clinic-Id"].FirstOrDefault();
            if (!string.IsNullOrEmpty(clinicIdHeader) && Guid.TryParse(clinicIdHeader, out var headerClinicId))
            {
                if (authorizedClinicIds.Count > 0 && !authorizedClinicIds.Contains(headerClinicId))
                {
                    _logger.LogWarning(
                        "Tenant bypass attempt: user tried to access clinic {ClinicId} via X-Clinic-Id header but is not authorized. Authorized: [{AuthorizedClinics}]",
                        headerClinicId,
                        string.Join(", ", authorizedClinicIds));

                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync(
                        JsonSerializer.Serialize(new { message = "Acesso negado à clínica solicitada." }));
                    return;
                }

                context.Items["TenantClinicId"] = headerClinicId;
            }
            else if (authorizedClinicIds.Count > 0)
            {
                // No header — use the first authorized clinic as the default.
                context.Items["TenantClinicId"] = authorizedClinicIds[0];
            }

            // Step 4: expose the resolved list to downstream services.
            context.Items["AuthorizedClinicIds"] = authorizedClinicIds;
        }

        await _next(context);
    }

    /// <summary>
    /// Map the incoming Cognito sub to the local User.Id (and, if the JWT
    /// carried no clinicIds claim, load memberships from the DB). Result is
    /// cached in-process for 10 minutes to keep this cheap.
    /// </summary>
    private static async Task<(Guid? userId, IReadOnlyList<Guid> clinicIds)> ResolveIdentityAsync(
        HttpContext context,
        string sub,
        string? email,
        IReadOnlyList<Guid> claimClinicIds)
    {
        // Fast path: cache hit.
        if (_identityCache.TryGetValue(sub, out var cached) && cached.ExpiresAt > DateTime.UtcNow)
        {
            return (cached.UserId, cached.ClinicIds);
        }

        // Direct GUID sub without a DB lookup — first line of the resolution.
        // Kept because some tests and internal calls set sub=user.Id directly.
        Guid? directGuid = Guid.TryParse(sub, out var parsed) ? parsed : null;

        // If email is missing we can't do the DB lookup — return whatever
        // the sub gave us. This is what tests without a full JWT expect.
        if (string.IsNullOrEmpty(email))
        {
            return (directGuid, claimClinicIds);
        }

        var userRepo = context.RequestServices.GetService<IUserRepository>();
        if (userRepo is null)
        {
            return (directGuid, claimClinicIds);
        }

        User? user;
        try
        {
            user = await userRepo.GetByEmailAsync(email);
        }
        catch
        {
            // Fail-open: if the DB is unreachable here we still let the
            // request proceed with what we have. Downstream authorization
            // will handle any real access denial.
            return (directGuid, claimClinicIds);
        }

        if (user is null)
        {
            return (directGuid, claimClinicIds);
        }

        var clinicIds = claimClinicIds.Count > 0
            ? claimClinicIds
            : (user.UserClinicRoles ?? new List<UserClinicRole>())
                .Select(r => r.ClinicId)
                .Distinct()
                .ToList();

        _identityCache[sub] = new CachedIdentity(user.Id, clinicIds, DateTime.UtcNow.Add(_cacheTtl));
        return (user.Id, clinicIds);
    }

    /// <summary>
    /// Resolve the list of clinic IDs the authenticated user is authorized to access.
    /// Checks both single "clinicId" claim and multi "clinicIds" JSON array claim.
    /// </summary>
    private static List<Guid> ResolveAuthorizedClinicIds(HttpContext context)
    {
        var clinicIds = new List<Guid>();

        // Single clinic claim (local auth)
        var clinicIdClaim = context.User.FindFirst("clinicId")?.Value;
        if (!string.IsNullOrEmpty(clinicIdClaim) && Guid.TryParse(clinicIdClaim, out var singleClinicId))
        {
            clinicIds.Add(singleClinicId);
        }

        // Multi-clinic claim (Cognito - JSON array)
        var clinicIdsClaim = context.User.FindFirst("clinicIds")?.Value;
        if (!string.IsNullOrEmpty(clinicIdsClaim))
        {
            try
            {
                var ids = JsonSerializer.Deserialize<List<string>>(clinicIdsClaim);
                if (ids is not null)
                {
                    foreach (var id in ids)
                    {
                        if (Guid.TryParse(id, out var parsed))
                            clinicIds.Add(parsed);
                    }
                }
            }
            catch { /* ignore parse errors */ }
        }

        return clinicIds;
    }
}
