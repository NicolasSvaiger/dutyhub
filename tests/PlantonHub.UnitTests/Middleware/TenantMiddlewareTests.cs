using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using PlantonHub.API.Middleware;

namespace PlantonHub.UnitTests.Middleware;

/// <summary>
/// Validates: Requirements 1.2, 3.1
/// Tests claims extraction in TenantMiddleware.
/// </summary>
public class TenantMiddlewareTests
{
    private (TenantMiddleware middleware, DefaultHttpContext context) CreateMiddleware(ClaimsPrincipal? user = null)
    {
        var context = new DefaultHttpContext();
        if (user != null)
        {
            context.User = user;
        }

        RequestDelegate next = _ => Task.CompletedTask;

        var middleware = new TenantMiddleware(next);
        return (middleware, context);
    }

    private ClaimsPrincipal CreateAuthenticatedUser(params Claim[] claims)
    {
        var identity = new ClaimsIdentity(claims, "TestAuth");
        return new ClaimsPrincipal(identity);
    }

    private ClaimsPrincipal CreateUnauthenticatedUser()
    {
        var identity = new ClaimsIdentity(); // No auth type = unauthenticated
        return new ClaimsPrincipal(identity);
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithClinicId_ExtractsClinicIdToItems()
    {
        var clinicId = Guid.NewGuid();
        var user = CreateAuthenticatedUser(new Claim("clinicId", clinicId.ToString()));
        var (middleware, context) = CreateMiddleware(user);

        await middleware.InvokeAsync(context);

        context.Items.Should().ContainKey("TenantClinicId");
        context.Items["TenantClinicId"].Should().Be(clinicId);
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithSubClaim_ExtractsUserIdToItems()
    {
        var userId = Guid.NewGuid();
        var user = CreateAuthenticatedUser(
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()));
        var (middleware, context) = CreateMiddleware(user);

        await middleware.InvokeAsync(context);

        context.Items.Should().ContainKey("CurrentUserId");
        context.Items["CurrentUserId"].Should().Be(userId);
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithSubStringClaim_ExtractsUserIdToItems()
    {
        var userId = Guid.NewGuid();
        var user = CreateAuthenticatedUser(new Claim("sub", userId.ToString()));
        var (middleware, context) = CreateMiddleware(user);

        await middleware.InvokeAsync(context);

        context.Items.Should().ContainKey("CurrentUserId");
        context.Items["CurrentUserId"].Should().Be(userId);
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithBothClaims_ExtractsBothToItems()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var user = CreateAuthenticatedUser(
            new Claim("clinicId", clinicId.ToString()),
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()));
        var (middleware, context) = CreateMiddleware(user);

        await middleware.InvokeAsync(context);

        context.Items["TenantClinicId"].Should().Be(clinicId);
        context.Items["CurrentUserId"].Should().Be(userId);
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithNoClinicIdClaim_PassesThroughWithoutError()
    {
        var user = CreateAuthenticatedUser(
            new Claim(JwtRegisteredClaimNames.Sub, Guid.NewGuid().ToString()));
        var (middleware, context) = CreateMiddleware(user);

        await middleware.InvokeAsync(context);

        context.Items.Should().NotContainKey("TenantClinicId");
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithInvalidClinicIdGuid_DoesNotSetTenantClinicId()
    {
        var user = CreateAuthenticatedUser(new Claim("clinicId", "not-a-valid-guid"));
        var (middleware, context) = CreateMiddleware(user);

        await middleware.InvokeAsync(context);

        context.Items.Should().NotContainKey("TenantClinicId");
    }

    [Fact]
    public async Task InvokeAsync_UnauthenticatedRequest_PassesThroughWithoutError()
    {
        var user = CreateUnauthenticatedUser();
        var (middleware, context) = CreateMiddleware(user);

        await middleware.InvokeAsync(context);

        context.Items.Should().NotContainKey("TenantClinicId");
        context.Items.Should().NotContainKey("CurrentUserId");
    }

    [Fact]
    public async Task InvokeAsync_UnauthenticatedRequest_CallsNext()
    {
        var user = CreateUnauthenticatedUser();
        var context = new DefaultHttpContext { User = user };
        var nextCalled = false;

        RequestDelegate next = _ =>
        {
            nextCalled = true;
            return Task.CompletedTask;
        };
        var middleware = new TenantMiddleware(next);

        await middleware.InvokeAsync(context);

        nextCalled.Should().BeTrue();
    }

    [Fact]
    public async Task InvokeAsync_AuthenticatedWithEmptyClinicId_DoesNotSetTenantClinicId()
    {
        var user = CreateAuthenticatedUser(new Claim("clinicId", ""));
        var (middleware, context) = CreateMiddleware(user);

        await middleware.InvokeAsync(context);

        context.Items.Should().NotContainKey("TenantClinicId");
    }

    [Fact]
    public async Task InvokeAsync_AlwaysCallsNextDelegate()
    {
        var clinicId = Guid.NewGuid();
        var user = CreateAuthenticatedUser(new Claim("clinicId", clinicId.ToString()));
        var context = new DefaultHttpContext { User = user };
        var nextCalled = false;

        RequestDelegate next = _ =>
        {
            nextCalled = true;
            return Task.CompletedTask;
        };
        var middleware = new TenantMiddleware(next);

        await middleware.InvokeAsync(context);

        nextCalled.Should().BeTrue();
    }
}
