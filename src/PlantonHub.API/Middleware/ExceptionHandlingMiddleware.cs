using System.Text.Json;
using FluentValidation;
using PlantonHub.Application.Exceptions;

namespace PlantonHub.API.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, title, detail) = exception switch
        {
            UnauthorizedException ex => (StatusCodes.Status401Unauthorized, "Unauthorized", ex.Message),
            ForbiddenException ex => (StatusCodes.Status403Forbidden, "Forbidden", ex.Message),
            NotFoundException ex => (StatusCodes.Status404NotFound, "Not Found", ex.Message),
            ConflictException ex => (StatusCodes.Status409Conflict, "Conflict", ex.Message),
            BadRequestException ex => (StatusCodes.Status400BadRequest, "Bad Request", ex.Message),
            PayloadTooLargeException ex => (StatusCodes.Status413RequestEntityTooLarge, "Payload Too Large", ex.Message),
            RateLimitExceededException ex => (StatusCodes.Status429TooManyRequests, "Too Many Requests", ex.Message),
            ValidationException ex => (StatusCodes.Status400BadRequest, "Validation Error", ex.Message),
            _ => (StatusCodes.Status500InternalServerError, "Internal Server Error", "An unexpected error occurred.")
        };

        if (statusCode == StatusCodes.Status500InternalServerError)
        {
            _logger.LogError(exception, "An unhandled exception occurred.");
        }

        // Add Retry-After header for rate-limited responses
        if (statusCode == StatusCodes.Status429TooManyRequests)
        {
            context.Response.Headers["Retry-After"] = "300"; // 5 minutes (matches rate limit window)
        }

        context.Response.ContentType = "application/problem+json";
        context.Response.StatusCode = statusCode;

        var problemDetails = new Dictionary<string, object?>
        {
            ["type"] = "https://tools.ietf.org/html/rfc7807",
            ["title"] = title,
            ["status"] = statusCode,
            ["detail"] = detail
        };

        if (exception is ValidationException validationException)
        {
            var errors = validationException.Errors
                .GroupBy(e => e.PropertyName)
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(e => e.ErrorMessage).ToArray()
                );
            problemDetails["errors"] = errors;
        }

        // ConflictException may carry structured extensions (e.g., activeAttendance
        // info for the 409 when a professional already has an open check-in).
        if (exception is ConflictException conflictEx && conflictEx.Extensions is not null)
        {
            foreach (var (key, value) in conflictEx.Extensions)
            {
                problemDetails[key] = value;
            }
        }

        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        await context.Response.WriteAsync(JsonSerializer.Serialize(problemDetails, options));
    }
}
