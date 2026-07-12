using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using PlantonHub.API.Middleware;

namespace PlantonHub.UnitTests.Middleware;

public class SecurityHeadersMiddlewareTests
{
    /// <summary>
    /// Creates a middleware + context that properly fires OnStarting callbacks.
    /// We capture the OnStarting delegate and invoke it manually after InvokeAsync.
    /// </summary>
    private async Task<IHeaderDictionary> GetResponseHeaders()
    {
        Func<object, Task>? onStartingCallback = null;

        var responseFeature = new Mock_HttpResponseFeature();
        var featureCollection = new FeatureCollection();
        featureCollection.Set<IHttpResponseFeature>(responseFeature);
        featureCollection.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(new MemoryStream()));

        var context = new DefaultHttpContext(featureCollection);

        // Capture the OnStarting callback
        responseFeature.OnStartingCallback = (callback, state) =>
        {
            onStartingCallback = _ => callback(state);
        };

        RequestDelegate next = _ => Task.CompletedTask;
        var middleware = new SecurityHeadersMiddleware(next);

        await middleware.InvokeAsync(context);

        // Invoke the OnStarting callback to simulate response starting
        if (onStartingCallback is not null)
            await onStartingCallback(null!);

        return context.Response.Headers;
    }

    [Fact]
    public async Task InvokeAsync_AddsXContentTypeOptions()
    {
        var headers = await GetResponseHeaders();
        headers["X-Content-Type-Options"].ToString().Should().Be("nosniff");
    }

    [Fact]
    public async Task InvokeAsync_AddsXFrameOptions()
    {
        var headers = await GetResponseHeaders();
        headers["X-Frame-Options"].ToString().Should().Be("DENY");
    }

    [Fact]
    public async Task InvokeAsync_AddsReferrerPolicy()
    {
        var headers = await GetResponseHeaders();
        headers["Referrer-Policy"].ToString().Should().Be("strict-origin-when-cross-origin");
    }

    [Fact]
    public async Task InvokeAsync_AddsContentSecurityPolicy()
    {
        var headers = await GetResponseHeaders();
        headers["Content-Security-Policy"].ToString().Should().Contain("default-src 'self'");
    }

    [Fact]
    public async Task InvokeAsync_AddsStrictTransportSecurity()
    {
        var headers = await GetResponseHeaders();
        headers["Strict-Transport-Security"].ToString().Should().Contain("max-age=31536000");
    }

    [Fact]
    public async Task InvokeAsync_AddsXPermittedCrossDomainPolicies()
    {
        var headers = await GetResponseHeaders();
        headers["X-Permitted-Cross-Domain-Policies"].ToString().Should().Be("none");
    }

    [Fact]
    public async Task InvokeAsync_RemovesServerHeader()
    {
        // For this test we need to pre-set the Server header and verify it's removed
        Func<object, Task>? onStartingCallback = null;

        var responseFeature = new Mock_HttpResponseFeature();
        var featureCollection = new FeatureCollection();
        featureCollection.Set<IHttpResponseFeature>(responseFeature);
        featureCollection.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(new MemoryStream()));

        var context = new DefaultHttpContext(featureCollection);
        context.Response.Headers["Server"] = "Kestrel";

        responseFeature.OnStartingCallback = (callback, state) =>
        {
            onStartingCallback = _ => callback(state);
        };

        RequestDelegate next = _ => Task.CompletedTask;
        var middleware = new SecurityHeadersMiddleware(next);

        await middleware.InvokeAsync(context);
        if (onStartingCallback is not null)
            await onStartingCallback(null!);

        context.Response.Headers.ContainsKey("Server").Should().BeFalse();
    }

    [Fact]
    public async Task InvokeAsync_RemovesXPoweredByHeader()
    {
        Func<object, Task>? onStartingCallback = null;

        var responseFeature = new Mock_HttpResponseFeature();
        var featureCollection = new FeatureCollection();
        featureCollection.Set<IHttpResponseFeature>(responseFeature);
        featureCollection.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(new MemoryStream()));

        var context = new DefaultHttpContext(featureCollection);
        context.Response.Headers["X-Powered-By"] = "ASP.NET";

        responseFeature.OnStartingCallback = (callback, state) =>
        {
            onStartingCallback = _ => callback(state);
        };

        RequestDelegate next = _ => Task.CompletedTask;
        var middleware = new SecurityHeadersMiddleware(next);

        await middleware.InvokeAsync(context);
        if (onStartingCallback is not null)
            await onStartingCallback(null!);

        context.Response.Headers.ContainsKey("X-Powered-By").Should().BeFalse();
    }

    /// <summary>
    /// Minimal IHttpResponseFeature implementation that captures OnStarting callbacks.
    /// </summary>
    private class Mock_HttpResponseFeature : IHttpResponseFeature
    {
        public int StatusCode { get; set; } = 200;
        public string? ReasonPhrase { get; set; }
        public IHeaderDictionary Headers { get; set; } = new HeaderDictionary();
        public Stream Body { get; set; } = new MemoryStream();
        public bool HasStarted => false;

        public Action<Func<object, Task>, object>? OnStartingCallback { get; set; }

        public void OnStarting(Func<object, Task> callback, object state)
        {
            OnStartingCallback?.Invoke(callback, state);
        }

        public void OnCompleted(Func<object, Task> callback, object state) { }
    }
}
