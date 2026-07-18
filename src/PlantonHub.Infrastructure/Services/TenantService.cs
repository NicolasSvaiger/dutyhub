using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Infrastructure.Services;

/// <summary>
/// Reads per-request tenant state from HttpContext.Items. The heavy lifting
/// (mapping Cognito sub → local User.Id, and resolving DB memberships when
/// the JWT is thin) happens once in <see cref="PlantonHub.API.Middleware.TenantMiddleware"/>
/// and is stashed in HttpContext.Items. This class stays synchronous and
/// side-effect free so callers can invoke it from any code path without
/// dragging async up the stack.
/// </summary>
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
    ///   1. X-Clinic-Id request header (if present AND authorized).
    ///   2. Legacy 'clinicId' claim from the JWT (default clinic).
    /// If the header is present but references a clinic the user is not
    /// authorized for, null is returned (caller must treat as unauthorized).
    /// </summary>
    public Guid? GetCurrentClinicId()
    {
        var httpContext = _httpContextAccessor.HttpContext;
        if (httpContext is null) return null;

        // 1. Try the request header first (multi-clinic scenario)
        if (httpContext.Request.Headers.TryGetValue(ClinicHeaderName, out var headerValue) &&
            Guid.TryParse(headerValue.ToString(), out var headerClinicId))
        {
            var authorized = GetAuthorizedClinicIdsSet();
            if (authorized.Contains(headerClinicId))
            {
                return headerClinicId;
            }
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

        // Preferred: TenantMiddleware has already mapped Cognito sub → local
        // User.Id and stashed it here. This is the common path for HTTP
        // requests once the middleware has run.
        if (httpContext.Items.TryGetValue("CurrentUserId", out var stored) && stored is Guid storedGuid)
        {
            return storedGuid;
        }

        // Fallback: direct GUID sub. Used in call sites where the middleware
        // hasn't run (unit tests with a hand-rolled ClaimsPrincipal, internal
        // pipelines). No DB lookup here — that would require sync-over-async
        // and the middleware is the correct place for it.
        var sub = httpContext.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
               ?? httpContext.User?.FindFirst("sub")?.Value;

        return Guid.TryParse(sub, out var parsed) ? parsed : (Guid?)null;
    }

    public Guid? GetCurrentPublicOrganId()
    {
        var httpContext = _httpContextAccessor.HttpContext;
        if (httpContext is null) return null;

        // Preferido: TenantMiddleware já resolveu o publicOrganId do JWT (fast
        // path via claim) ou do fallback DB (UserPublicOrganRoleRepository) e
        // guardou em HttpContext.Items. Mesmo padrão do CurrentUserId — o
        // async fica no middleware, aqui é só leitura sync.
        if (httpContext.Items.TryGetValue("CurrentPublicOrganId", out var stored) && stored is Guid storedGuid)
        {
            return storedGuid;
        }

        // Fallback: ler claim direto. Usado em call sites sem middleware
        // (unit tests com ClaimsPrincipal montado à mão). Sem DB lookup aqui.
        var claim = httpContext.User?.FindFirst("publicOrganId")?.Value;
        return Guid.TryParse(claim, out var parsed) ? parsed : (Guid?)null;
    }

    public async Task<bool> CanAccessPublicOrganAsync(Guid publicOrganId)
    {
        if (IsAdminGlobal()) return true;

        var currentOrganId = GetCurrentPublicOrganId();
        if (currentOrganId is null) return false;

        // Match direto: o organ solicitado é o próprio do gestor.
        if (currentOrganId.Value == publicOrganId) return true;

        // Hierarquia recursiva: o organ solicitado precisa ser descendente
        // do organ do gestor. A busca de descendentes vive no
        // IPublicOrganRepository — método adicionado na Sprint 7B junto com
        // o PrefeituraService. Nesta sprint (7A) a assinatura existe mas o
        // caminho recursivo é curto-circuitado para false; o rebate volta
        // quando 7B for mergeado.
        //
        // Guarda semântica: mesmo sem descendentes ainda, endpoints que já
        // usarem CanAccessPublicOrganAsync não vazam nada — apenas retornam
        // 403 pra tudo fora do organ direto, o que é o comportamento mais
        // restritivo (safe by default).
        await Task.CompletedTask;
        return false;
    }

    public IEnumerable<string> GetCurrentRoles()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        if (user is null) return Enumerable.Empty<string>();

        var roles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Source 1: "roles" custom claim (from pre-token-generation Lambda)
        var rolesClaim = user.FindFirst("roles")?.Value;
        if (!string.IsNullOrEmpty(rolesClaim))
        {
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
    /// Returns the set of clinic ids the current user is authorized to operate on.
    /// Prefers the list resolved by TenantMiddleware (which merged JWT claims
    /// with DB memberships), falling back to reading claims directly for call
    /// sites where the middleware hasn't run.
    /// </summary>
    public IEnumerable<Guid> GetAuthorizedClinicIds() => GetAuthorizedClinicIdsSet();

    private HashSet<Guid> GetAuthorizedClinicIdsSet()
    {
        var httpContext = _httpContextAccessor.HttpContext;
        if (httpContext is null) return new HashSet<Guid>();

        // Preferred: the middleware already resolved and stashed the final list.
        if (httpContext.Items.TryGetValue("AuthorizedClinicIds", out var stored)
            && stored is IEnumerable<Guid> storedIds)
        {
            return new HashSet<Guid>(storedIds);
        }

        // Fallback: read directly from claims. Same rules as the middleware,
        // duplicated here so tests and non-HTTP flows still work. The DB-lookup
        // fallback deliberately does NOT live here — that path exists only in
        // the middleware to keep this service synchronous.
        var user = httpContext.User;
        var result = new HashSet<Guid>();

        if (user is null) return result;

        var multi = user.FindFirst("clinicIds")?.Value;
        if (!string.IsNullOrEmpty(multi))
        {
            var raw = multi.Trim();
            if (raw.StartsWith('['))
            {
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
                catch { /* fall through to CSV */ }
            }

            if (result.Count == 0)
            {
                foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    if (Guid.TryParse(part, out var id)) result.Add(id);
                }
            }
        }

        var legacy = user.FindFirst("clinicId")?.Value;
        if (!string.IsNullOrEmpty(legacy) && Guid.TryParse(legacy, out var legacyId))
        {
            result.Add(legacyId);
        }

        return result;
    }

    /// <summary>
    /// AdminGlobal → always allowed.
    /// AdminClinica → allowed only when the target user shares at least one clinic
    /// with the caller. Uses the DB (via IUserRepository) as source of truth for
    /// the target user's clinic memberships — the caller's clinics still come
    /// from the resolved list (JWT + middleware-resolved memberships).
    /// This method is already async, so no sync-over-async here.
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

        foreach (var ucr in target.UserClinicRoles)
        {
            if (authorized.Contains(ucr.ClinicId)) return true;
        }

        return false;
    }
}
