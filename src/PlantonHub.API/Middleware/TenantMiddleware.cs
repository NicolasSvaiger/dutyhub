using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;

namespace PlantonHub.API.Middleware;

public class TenantMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TenantMiddleware> _logger;

    public TenantMiddleware(RequestDelegate next, ILogger<TenantMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            // Resolve authorized clinic IDs from claims
            var authorizedClinicIds = ResolveAuthorizedClinicIds(context);

            // Clinic ID: check X-Clinic-Id header first, then claims
            var clinicIdHeader = context.Request.Headers["X-Clinic-Id"].FirstOrDefault();
            if (!string.IsNullOrEmpty(clinicIdHeader) && Guid.TryParse(clinicIdHeader, out var headerClinicId))
            {
                // SECURITY: validate that the requested clinic is in the user's authorized list
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
            else
            {
                // Fallback: use first authorized clinic from claims
                if (authorizedClinicIds.Count > 0)
                {
                    context.Items["TenantClinicId"] = authorizedClinicIds[0];
                }
            }

            // Store full list of authorized clinics for services that need it
            context.Items["AuthorizedClinicIds"] = authorizedClinicIds;

            // User ID: "sub" claim (works for both local and Cognito)
            var userIdClaim = context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                           ?? context.User.FindFirst("sub")?.Value;
            if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var userId))
            {
                context.Items["CurrentUserId"] = userId;
            }
        }

        await _next(context);
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
