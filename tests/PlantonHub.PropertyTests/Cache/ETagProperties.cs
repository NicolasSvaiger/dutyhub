using System.Text;
using System.Security.Cryptography;
using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Routing;
using PlantonHub.API.Filters;

namespace PlantonHub.PropertyTests.Cache;

/// <summary>
/// Property-based tests for ETag and Cache-Control headers.
/// Validates: Requirements 6.1, 6.2, 6.3, 6.4
/// </summary>
[Trait("Feature", "redis-cache-layer")]
public class ETagProperties
{
    private static ActionExecutingContext CreateActionExecutingContext(
        string httpMethod,
        string? ifNoneMatch = null)
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Method = httpMethod;

        if (!string.IsNullOrEmpty(ifNoneMatch))
        {
            httpContext.Request.Headers["If-None-Match"] = ifNoneMatch;
        }

        var actionContext = new ActionContext(
            httpContext,
            new RouteData(),
            new ActionDescriptor(),
            new ModelStateDictionary());

        return new ActionExecutingContext(
            actionContext,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            controller: null!);
    }

    private static ActionExecutionDelegate CreateNextDelegate(
        ActionExecutingContext executingContext,
        object? responseValue)
    {
        return () =>
        {
            var executedContext = new ActionExecutedContext(
                executingContext,
                new List<IFilterMetadata>(),
                controller: null!)
            {
                Result = new OkObjectResult(responseValue)
            };

            return Task.FromResult(executedContext);
        };
    }

    private static string ComputeExpectedETag(object value)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(value);
        var bodyBytes = Encoding.UTF8.GetBytes(json);
        var hashBytes = SHA256.HashData(bodyBytes);
        return $"\"{Convert.ToHexString(hashBytes).ToLowerInvariant()}\"";
    }

    /// <summary>
    /// **Validates: Requirements 6.1, 6.2**
    /// Property 5: ETag round-trip returns 304 when data unchanged.
    /// For any serializable object used as response body, if you:
    /// 1. Execute the filter once (no If-None-Match) → get an ETag in response headers
    /// 2. Execute the filter again with that ETag in If-None-Match → get 304 Not Modified
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property ETag_RoundTrip_Returns_304_When_Data_Unchanged()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            responseValue =>
            {
                var filter = new ETagActionFilter();

                // Step 1: First request (GET, no If-None-Match) → get ETag
                var firstContext = CreateActionExecutingContext("GET");
                var firstNext = CreateNextDelegate(firstContext, responseValue.Get);

                filter.OnActionExecutionAsync(firstContext, firstNext)
                    .GetAwaiter().GetResult();

                var etag = firstContext.HttpContext.Response.Headers.ETag.ToString();
                etag.Should().NotBeNullOrEmpty("first GET should produce an ETag");

                // Step 2: Second request with If-None-Match = ETag → 304
                var secondContext = CreateActionExecutingContext("GET", ifNoneMatch: etag);
                var secondNext = CreateNextDelegate(secondContext, responseValue.Get);

                filter.OnActionExecutionAsync(secondContext, secondNext)
                    .GetAwaiter().GetResult();

                // The filter should have replaced the result with 304
                var executedContext = secondNext().GetAwaiter().GetResult();
                // We need to check the actual second execution result
                // Re-run since we need to inspect what the filter set
                var verifyContext = CreateActionExecutingContext("GET", ifNoneMatch: etag);
                ActionExecutedContext? capturedExecutedContext = null;
                ActionExecutionDelegate verifyNext = () =>
                {
                    capturedExecutedContext = new ActionExecutedContext(
                        verifyContext,
                        new List<IFilterMetadata>(),
                        controller: null!)
                    {
                        Result = new OkObjectResult(responseValue.Get)
                    };
                    return Task.FromResult(capturedExecutedContext);
                };

                filter.OnActionExecutionAsync(verifyContext, verifyNext)
                    .GetAwaiter().GetResult();

                capturedExecutedContext.Should().NotBeNull();
                capturedExecutedContext!.Result.Should().BeOfType<StatusCodeResult>()
                    .Which.StatusCode.Should().Be(StatusCodes.Status304NotModified);
            });
    }

    /// <summary>
    /// **Validates: Requirements 6.1, 6.3, 6.4**
    /// Property 6: Headers de cache presentes apenas em respostas GET.
    /// For any HTTP method that is NOT GET (POST, PUT, DELETE, PATCH),
    /// the filter should NOT add ETag or Cache-Control headers.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property Cache_Headers_Only_Present_On_GET_Responses()
    {
        var nonGetMethods = Gen.Elements("POST", "PUT", "DELETE", "PATCH");

        return Prop.ForAll(
            nonGetMethods.ToArbitrary(),
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            (method, responseValue) =>
            {
                var filter = new ETagActionFilter();

                var context = CreateActionExecutingContext(method);
                var nextCalled = false;

                ActionExecutionDelegate next = () =>
                {
                    nextCalled = true;
                    var executedContext = new ActionExecutedContext(
                        context,
                        new List<IFilterMetadata>(),
                        controller: null!)
                    {
                        Result = new OkObjectResult(responseValue.Get)
                    };
                    return Task.FromResult(executedContext);
                };

                filter.OnActionExecutionAsync(context, next)
                    .GetAwaiter().GetResult();

                // Assert: next() was called (filter passes through)
                nextCalled.Should().BeTrue("filter should call next() for non-GET methods");

                // Assert: No ETag or Cache-Control headers added
                var response = context.HttpContext.Response;
                response.Headers.ETag.ToString().Should().BeEmpty(
                    $"ETag should not be added for {method} requests");
                response.Headers.CacheControl.ToString().Should().BeEmpty(
                    $"Cache-Control should not be added for {method} requests");
            });
    }
}
