using System.Text.Json;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Middleware;

/// <summary>
/// Middleware que intercepta requisições autenticadas e verifica
/// se o token JWT está na blacklist antes de prosseguir.
/// Executa após Authentication e antes de Authorization.
/// </summary>
public class TokenBlacklistMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TokenBlacklistMiddleware> _logger;

    public TokenBlacklistMiddleware(RequestDelegate next, ILogger<TokenBlacklistMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Skip check if user is not authenticated
        if (context.User.Identity is not { IsAuthenticated: true })
        {
            await _next(context);
            return;
        }

        var jti = context.User.Claims.FirstOrDefault(c => c.Type == "jti")?.Value;

        // If no JTI claim present, proceed (nothing to check)
        if (string.IsNullOrEmpty(jti))
        {
            await _next(context);
            return;
        }

        var blacklistService = context.RequestServices.GetRequiredService<ITokenBlacklistService>();

        try
        {
            var isBlacklisted = await blacklistService.IsBlacklistedAsync(jti, context.RequestAborted);

            if (isBlacklisted)
            {
                _logger.LogWarning("Blocked request with blacklisted token. JTI: {Jti}", jti);

                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync(
                    JsonSerializer.Serialize(new { message = "Token revoked" }));
                return;
            }
        }
        catch (Exception ex)
        {
            // Fail-closed: if Redis is unavailable, reject the request (503)
            // This prevents revoked tokens from being used during infrastructure outages
            _logger.LogError(ex, "Failed to check token blacklist for JTI: {Jti}. Blocking request (fail-closed).", jti);

            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(
                JsonSerializer.Serialize(new { message = "Serviço temporariamente indisponível. Tente novamente." }));
            return;
        }

        await _next(context);
    }
}
