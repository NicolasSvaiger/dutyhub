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
    // sub → publicOrganId. Cache separado propositalmente: só é consultado
    // quando o user tem role GestorPublico (~1% dos usuários), evitando
    // fazer round-trip DB pro caso comum (profissional / admin).
    private static readonly ConcurrentDictionary<string, CachedPublicOrgan> _publicOrganCache = new();
    private static readonly TimeSpan _cacheTtl = TimeSpan.FromMinutes(10);

    private readonly record struct CachedIdentity(Guid UserId, IReadOnlyList<Guid> ClinicIds, DateTime ExpiresAt);
    private readonly record struct CachedPublicOrgan(Guid PublicOrganId, DateTime ExpiresAt);

    public TenantMiddleware(RequestDelegate next, ILogger<TenantMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            // Two lists kept intentionally distinct:
            //   claimClinicIds        — what the JWT explicitly authorized.
            //                           Basis for the Sprint 4 tenant-bypass
            //                           check (returns 403).
            //   authorizedClinicIds   — effective set (JWT ∪ DB memberships).
            //                           Basis for downstream service filtering.
            //
            // Keeping them separate lets us preserve two contracts that
            // otherwise contradict each other:
            //   * TenantBypassTests expect 403 when the header contradicts
            //     the JWT (Sprint 4 security fix).
            //   * DoctorFlowIntegrationTests expect silent 200/empty when
            //     the JWT is thin and the header is unrelated to the user's
            //     DB memberships (original TenantService contract).
            var claimClinicIds = ResolveAuthorizedClinicIds(context);
            var authorizedClinicIds = claimClinicIds;

            // Resolve local User.Id via the middleware (async here, sync at
            // the TenantService call sites downstream).
            var sub = context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                   ?? context.User.FindFirst("sub")?.Value;
            var email = context.User.FindFirst("email")?.Value
                     ?? context.User.FindFirst("username")?.Value;

            if (!string.IsNullOrEmpty(sub))
            {
                var (resolvedUserId, resolvedClinicIds) = await ResolveIdentityAsync(
                    context, sub, email, claimClinicIds);

                if (resolvedUserId.HasValue)
                {
                    context.Items["CurrentUserId"] = resolvedUserId.Value;
                }

                // Effective list picks up DB memberships only when the JWT
                // itself carried nothing — claimClinicIds is never widened.
                if (claimClinicIds.Count == 0 && resolvedClinicIds.Count > 0)
                {
                    authorizedClinicIds = new List<Guid>(resolvedClinicIds);
                }

                // Resolução do publicOrganId — só quando o user é
                // GestorPublico, pra evitar DB round-trip pros 99% que não são.
                // Fluxo: claim JWT (fast path) → cache → DB fallback via
                // IUserPublicOrganRoleRepository. Ver design.md § D2.
                var organId = await ResolvePublicOrganIdAsync(context, sub, resolvedUserId);
                if (organId.HasValue)
                {
                    context.Items["CurrentPublicOrganId"] = organId.Value;
                }
            }

            var clinicIdHeader = context.Request.Headers["X-Clinic-Id"].FirstOrDefault();
            if (!string.IsNullOrEmpty(clinicIdHeader) && Guid.TryParse(clinicIdHeader, out var headerClinicId))
            {
                // Path (a): the JWT brought explicit clinicIds and the header
                // asks for something outside that set. Tenant bypass — 403.
                if (claimClinicIds.Count > 0 && !claimClinicIds.Contains(headerClinicId))
                {
                    _logger.LogWarning(
                        "Tenant bypass attempt: user tried to access clinic {ClinicId} via X-Clinic-Id header but is not authorized. Authorized: [{AuthorizedClinics}]",
                        headerClinicId,
                        string.Join(", ", claimClinicIds));

                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync(
                        JsonSerializer.Serialize(new { message = "Acesso negado à clínica solicitada." }));
                    return;
                }

                // Path (b): the JWT was thin. The DB-resolved set is used
                // only to decide whether to expose TenantClinicId. When
                // the header points to something the DB doesn't know about
                // either, we silently drop it — downstream services yield
                // empty results, which is the documented contract.
                if (authorizedClinicIds.Contains(headerClinicId))
                {
                    context.Items["TenantClinicId"] = headerClinicId;
                }
                else
                {
                    _logger.LogWarning(
                        "Header X-Clinic-Id {ClinicId} not in user's memberships (JWT carried no clinicIds). Silently rejecting.",
                        headerClinicId);
                }
            }
            else if (authorizedClinicIds.Count > 0)
            {
                // No header — default to the first authorized clinic.
                context.Items["TenantClinicId"] = authorizedClinicIds[0];
            }

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
    /// Retorna o PublicOrgan do gestor logado.
    ///
    /// Ordem de resolução:
    ///   1. Se o user não tem role <c>GestorPublico</c>, retorna null sem
    ///      tocar em cache ou DB. Fast path pros 99% dos users.
    ///   2. Claim <c>publicOrganId</c> do JWT (fast path) — injetado pela
    ///      Lambda pre-token-generation do Cognito.
    ///   3. Cache in-process (10min TTL).
    ///   4. Fallback DB via <see cref="IUserPublicOrganRoleRepository"/> —
    ///      cobre gestor legado sem claim ou Lambda offline. Retorna o
    ///      primeiro organ da lista (multi-organ é débito documentado em
    ///      design.md § R4).
    /// </summary>
    private static async Task<Guid?> ResolvePublicOrganIdAsync(
        HttpContext context,
        string sub,
        Guid? userId)
    {
        // Guard 1: só resolve pra gestor. Evita DB call pros outros roles.
        if (!IsGestorPublico(context)) return null;

        // Guard 2: prefer claim JWT quando presente e válido.
        var claim = context.User.FindFirst("publicOrganId")?.Value;
        if (Guid.TryParse(claim, out var fromClaim))
        {
            return fromClaim;
        }

        // Guard 3: cache hit.
        if (_publicOrganCache.TryGetValue(sub, out var cached) && cached.ExpiresAt > DateTime.UtcNow)
        {
            return cached.PublicOrganId;
        }

        // Guard 4: DB fallback só faz sentido se já resolvemos o userId local.
        // Se não, não temos por onde procurar.
        if (userId is null) return null;

        var organRepo = context.RequestServices.GetService<IUserPublicOrganRoleRepository>();
        if (organRepo is null) return null;

        try
        {
            var roles = await organRepo.GetByUserIdAsync(userId.Value);
            var first = roles.FirstOrDefault();
            if (first is null) return null;

            _publicOrganCache[sub] = new CachedPublicOrgan(first.PublicOrganId, DateTime.UtcNow.Add(_cacheTtl));
            return first.PublicOrganId;
        }
        catch
        {
            // Fail-open: se o DB estiver fora do ar, o request segue sem
            // organId. Downstream retorna 403/404 conforme apropriado.
            return null;
        }
    }

    /// <summary>
    /// Detecta se o usuário logado tem role <c>GestorPublico</c>. Não usa
    /// <see cref="ITenantService.GetCurrentRoles"/> pra evitar dependência
    /// circular (o middleware roda antes do TenantService ser resolvido);
    /// lê os claims direto igual o <c>AuthorizationExtensions.HasRole</c>.
    /// </summary>
    private static bool IsGestorPublico(HttpContext context)
    {
        var user = context.User;

        // Source 1: cognito:groups (Cognito nativo).
        foreach (var claim in user.FindAll("cognito:groups"))
        {
            if (string.Equals(claim.Value, "GestorPublico", StringComparison.OrdinalIgnoreCase))
                return true;
        }

        // Source 2: "roles" custom claim (JSON array ou CSV).
        var rolesClaim = user.FindFirst("roles")?.Value;
        if (string.IsNullOrEmpty(rolesClaim)) return false;

        var raw = rolesClaim.Trim();
        if (raw.StartsWith('['))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<string[]>(raw);
                if (parsed is not null)
                {
                    foreach (var r in parsed)
                    {
                        if (string.Equals(r?.Trim(), "GestorPublico", StringComparison.OrdinalIgnoreCase))
                            return true;
                    }
                    return false;
                }
            }
            catch { /* fall through to CSV */ }
        }

        foreach (var r in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (string.Equals(r, "GestorPublico", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
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
