using System.IdentityModel.Tokens.Jwt;

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
            var clinicIdClaim = context.User.FindFirst("clinicId")?.Value;
            if (!string.IsNullOrEmpty(clinicIdClaim) && Guid.TryParse(clinicIdClaim, out var clinicId))
            {
                context.Items["TenantClinicId"] = clinicId;
            }

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
