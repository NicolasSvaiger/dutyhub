using System.Security.Claims;
using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using PlantonHub.API.Middleware;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.UnitTests.Middleware;

/// <summary>
/// Unit tests and property-based tests for TokenBlacklistMiddleware.
/// **Validates: Requirements 7.2, 7.3**
/// Property 8: Token blacklisted resulta em 401 Unauthorized
/// </summary>
[Trait("Feature", "redis-cache-layer")]
public class TokenBlacklistMiddlewareTests
{
    private readonly Mock<ITokenBlacklistService> _blacklistServiceMock;
    private readonly Mock<ILogger<TokenBlacklistMiddleware>> _loggerMock;

    public TokenBlacklistMiddlewareTests()
    {
        _blacklistServiceMock = new Mock<ITokenBlacklistService>();
        _loggerMock = new Mock<ILogger<TokenBlacklistMiddleware>>();
    }

    private (TokenBlacklistMiddleware middleware, DefaultHttpContext context, bool[] nextCalled) CreateMiddleware(
        ClaimsPrincipal? user = null)
    {
        var nextCalled = new[] { false };
        RequestDelegate next = _ =>
        {
            nextCalled[0] = true;
            return Task.CompletedTask;
        };

        var middleware = new TokenBlacklistMiddleware(next, _loggerMock.Object);

        var context = new DefaultHttpContext();
        if (user != null)
        {
            context.User = user;
        }

        // Register ITokenBlacklistService in the request services
        var services = new ServiceCollection();
        services.AddSingleton(_blacklistServiceMock.Object);
        context.RequestServices = services.BuildServiceProvider();

        return (middleware, context, nextCalled);
    }

    private ClaimsPrincipal CreateAuthenticatedUser(params Claim[] claims)
    {
        var identity = new ClaimsIdentity(claims, "Bearer");
        return new ClaimsPrincipal(identity);
    }

    private ClaimsPrincipal CreateUnauthenticatedUser()
    {
        var identity = new ClaimsIdentity(); // No auth type = unauthenticated
        return new ClaimsPrincipal(identity);
    }

    #region Unit Tests

    [Fact]
    public async Task InvokeAsync_UnauthenticatedRequest_PassesThroughWithoutCheckingBlacklist()
    {
        // Arrange
        var user = CreateUnauthenticatedUser();
        var (middleware, context, nextCalled) = CreateMiddleware(user);

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        nextCalled[0].Should().BeTrue("unauthenticated requests should pass through");
        _blacklistServiceMock.Verify(
            s => s.IsBlacklistedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "blacklist should not be checked for unauthenticated requests");
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithoutJtiClaim_PassesThroughWithoutCheckingBlacklist()
    {
        // Arrange
        var user = CreateAuthenticatedUser(
            new Claim("sub", Guid.NewGuid().ToString()));
        var (middleware, context, nextCalled) = CreateMiddleware(user);

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        nextCalled[0].Should().BeTrue("requests without JTI should pass through");
        _blacklistServiceMock.Verify(
            s => s.IsBlacklistedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "blacklist should not be checked when no JTI claim");
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithNonBlacklistedToken_PassesThrough()
    {
        // Arrange
        var jti = Guid.NewGuid().ToString();
        var user = CreateAuthenticatedUser(new Claim("jti", jti));
        var (middleware, context, nextCalled) = CreateMiddleware(user);

        _blacklistServiceMock
            .Setup(s => s.IsBlacklistedAsync(jti, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        nextCalled[0].Should().BeTrue("non-blacklisted tokens should pass through");
        context.Response.StatusCode.Should().NotBe(401);
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithBlacklistedToken_Returns401()
    {
        // Arrange
        var jti = Guid.NewGuid().ToString();
        var user = CreateAuthenticatedUser(new Claim("jti", jti));
        var (middleware, context, nextCalled) = CreateMiddleware(user);

        // Need a writable response body
        context.Response.Body = new MemoryStream();

        _blacklistServiceMock
            .Setup(s => s.IsBlacklistedAsync(jti, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        nextCalled[0].Should().BeFalse("blacklisted tokens should be rejected");
        context.Response.StatusCode.Should().Be(401);
        context.Response.ContentType.Should().Be("application/json");

        // Read response body
        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var body = await new StreamReader(context.Response.Body).ReadToEndAsync();
        body.Should().Contain("Token revoked");
    }

    [Fact]
    public async Task InvokeAsync_BlacklistServiceThrows_PassesThroughFailOpen()
    {
        // Arrange
        var jti = Guid.NewGuid().ToString();
        var user = CreateAuthenticatedUser(new Claim("jti", jti));
        var (middleware, context, nextCalled) = CreateMiddleware(user);

        _blacklistServiceMock
            .Setup(s => s.IsBlacklistedAsync(jti, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("Redis unavailable"));

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        nextCalled[0].Should().BeTrue("fail-open: should pass through when Redis is unavailable");
        context.Response.StatusCode.Should().NotBe(401);
    }

    #endregion

    #region Property-Based Tests

    /// <summary>
    /// **Validates: Requirements 7.2, 7.3**
    /// Property 8: Token blacklisted resulta em 401 Unauthorized.
    /// For any valid JTI string that is blacklisted, the middleware returns 401
    /// with body containing "Token revoked".
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property Blacklisted_Token_Always_Returns_401_Unauthorized()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            jti =>
            {
                // Arrange
                var blacklistMock = new Mock<ITokenBlacklistService>();
                var loggerMock = new Mock<ILogger<TokenBlacklistMiddleware>>();
                var nextCalled = false;

                RequestDelegate next = _ =>
                {
                    nextCalled = true;
                    return Task.CompletedTask;
                };

                var middleware = new TokenBlacklistMiddleware(next, loggerMock.Object);
                var context = new DefaultHttpContext();
                context.Response.Body = new MemoryStream();

                // Authenticated user with JTI
                var identity = new ClaimsIdentity(
                    new[] { new Claim("jti", jti.Get) }, "Bearer");
                context.User = new ClaimsPrincipal(identity);

                // Register blacklist service
                blacklistMock
                    .Setup(s => s.IsBlacklistedAsync(jti.Get, It.IsAny<CancellationToken>()))
                    .ReturnsAsync(true);

                var services = new ServiceCollection();
                services.AddSingleton(blacklistMock.Object);
                context.RequestServices = services.BuildServiceProvider();

                // Act
                middleware.InvokeAsync(context).GetAwaiter().GetResult();

                // Assert
                var statusIs401 = context.Response.StatusCode == 401;
                var nextNotCalled = !nextCalled;

                context.Response.Body.Seek(0, SeekOrigin.Begin);
                var body = new StreamReader(context.Response.Body).ReadToEnd();
                var bodyContainsTokenRevoked = body.Contains("Token revoked");

                return statusIs401 && nextNotCalled && bodyContainsTokenRevoked;
            });
    }

    #endregion
}
