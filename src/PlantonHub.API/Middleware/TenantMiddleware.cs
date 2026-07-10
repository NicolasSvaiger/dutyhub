using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;

namespace PlantonHub.API.Middleware;

public class TenantMiddleware
{
    private readonly RequestDelegate _next;

    public TenantMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            // Clinic ID: check X-Clinic-Id header first, then claims
            var clinicIdHeader = context.Request.Headers["X-Clinic-Id"].FirstOrDefault();
            if (!string.IsNullOrEmpty(clinicIdHeader) && Guid.TryParse(clinicIdHeader, out var headerClinicId))
            {
                context.Items["TenantClinicId"] = headerClinicId;
            }
            else
            {
                // Local auth: "clinicId" claim
                var clinicIdClaim = context.User.FindFirst("clinicId")?.Value;
                if (!string.IsNullOrEmpty(clinicIdClaim) && Guid.TryParse(clinicIdClaim, out var clinicId))
                {
                    context.Items["TenantClinicId"] = clinicId;
                }
                // Cognito auth: "clinicIds" claim (JSON array, use first)
                else
                {
                    var clinicIdsClaim = context.User.FindFirst("clinicIds")?.Value;
                    if (!string.IsNullOrEmpty(clinicIdsClaim))
                    {
                        try
                        {
                            var ids = JsonSerializer.Deserialize<List<string>>(clinicIdsClaim);
                            if (ids?.Count > 0 && Guid.TryParse(ids[0], out var firstClinicId))
                            {
                                context.Items["TenantClinicId"] = firstClinicId;
                            }
                        }
                        catch { /* ignore parse errors */ }
                    }
                }
            }

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
}
