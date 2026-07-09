using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace PlantonHub.API.Filters;

/// <summary>
/// Action filter that:
/// - Computes ETag (SHA256 hash of the response body) for GET responses
/// - Compares with If-None-Match and returns 304 if match
/// - Adds Cache-Control: private, max-age=60 headers on GET listing responses
/// - Does not add cache headers on write operations (POST/PUT/DELETE)
/// </summary>
public class ETagActionFilter : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        // Only apply ETag logic to GET requests
        if (!HttpMethods.IsGet(context.HttpContext.Request.Method))
        {
            await next();
            return;
        }

        var executedContext = await next();

        // Only process successful ObjectResults (200 OK with a body)
        if (executedContext.Result is not ObjectResult objectResult
            || objectResult.Value is null
            || objectResult.StatusCode is not (null or 200))
        {
            return;
        }

        // Serialize the response body to compute the hash
        var responseBody = System.Text.Json.JsonSerializer.Serialize(objectResult.Value);
        var bodyBytes = Encoding.UTF8.GetBytes(responseBody);
        var hashBytes = SHA256.HashData(bodyBytes);
        var etag = $"\"{Convert.ToHexString(hashBytes).ToLowerInvariant()}\"";

        var request = context.HttpContext.Request;
        var response = context.HttpContext.Response;

        // Check If-None-Match header
        var ifNoneMatch = request.Headers.IfNoneMatch.ToString();

        if (!string.IsNullOrEmpty(ifNoneMatch) && ifNoneMatch == etag)
        {
            // Data unchanged — return 304 Not Modified
            executedContext.Result = new StatusCodeResult(StatusCodes.Status304NotModified);
            response.Headers.ETag = etag;
            return;
        }

        // Data changed or no If-None-Match — return full response with cache headers
        response.Headers.ETag = etag;
        response.Headers.CacheControl = "private, max-age=60";
    }
}
