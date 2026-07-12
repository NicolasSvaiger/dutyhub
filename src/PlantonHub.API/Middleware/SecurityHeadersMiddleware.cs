namespace PlantonHub.API.Middleware;

/// <summary>
/// Adds security headers to every HTTP response and removes headers
/// that expose server implementation details.
/// </summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Remove server identification headers before response is sent
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;

            // Prevent MIME-type sniffing
            headers["X-Content-Type-Options"] = "nosniff";

            // Prevent clickjacking
            headers["X-Frame-Options"] = "DENY";

            // Control referrer information leakage
            headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

            // Basic CSP: restrict resources to same origin, block framing
            headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'";

            // Force HTTPS for 1 year including subdomains
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";

            // Prevent cross-origin resource leakage
            headers["X-Permitted-Cross-Domain-Policies"] = "none";

            // Remove headers that expose implementation details
            headers.Remove("Server");
            headers.Remove("X-Powered-By");

            return Task.CompletedTask;
        });

        await _next(context);
    }
}
