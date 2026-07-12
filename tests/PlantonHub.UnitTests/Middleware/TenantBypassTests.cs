using System.Security.Claims;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Moq;
using PlantonHub.API.Middleware;

namespace PlantonHub.UnitTests.Middleware;

/// <summary>
/// Tests the Sprint 4 security fix: TenantMiddleware now validates
/// X-Clinic-Id header against the user's authorized clinicIds from claims.
/// Prevents tenant bypass attacks.
/// </summary>
public class TenantBypassTests
{
    private static ClaimsPrincipal CreateUserWithClinics(params Guid[] clinicIds)
    {
        var claims = new List<Claim>
        {
            new("sub", Guid.NewGuid().ToString()),
            new("clinicIds", JsonSerializer.Serialize(clinicIds.Select(id => id.ToString()).ToList())),
        };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        return new ClaimsPrincipal(identity);
    }

    [Fact]
    public async Task XClinicId_AuthorizedClinic_SetsContext()
    {
        var clinicId = Guid.NewGuid();
        var user = CreateUserWithClinics(clinicId);

        var context = new DefaultHttpContext { User = user };
        context.Request.Headers["X-Clinic-Id"] = clinicId.ToString();

        RequestDelegate next = _ => Task.CompletedTask;
        var middleware = new TenantMiddleware(next, Mock.Of<ILogger<TenantMiddleware>>());

        await middleware.InvokeAsync(context);

        context.Items["TenantClinicId"].Should().Be(clinicId);
        context.Response.StatusCode.Should().NotBe(403);
    }

    [Fact]
    public async Task XClinicId_UnauthorizedClinic_Returns403()
    {
        var authorizedClinic = Guid.NewGuid();
        var unauthorizedClinic = Guid.NewGuid();
        var user = CreateUserWithClinics(authorizedClinic);

        var context = new DefaultHttpContext { User = user };
        context.Request.Headers["X-Clinic-Id"] = unauthorizedClinic.ToString();
        context.Response.Body = new MemoryStream();

        RequestDelegate next = _ => Task.CompletedTask;
        var middleware = new TenantMiddleware(next, Mock.Of<ILogger<TenantMiddleware>>());

        await middleware.InvokeAsync(context);

        context.Response.StatusCode.Should().Be(403);
    }

    [Fact]
    public async Task XClinicId_NoClaimsAtAll_AllowsThrough()
    {
        // User with no clinicIds claim — can't validate, so allows through
        // (the authorization policies will block if needed)
        var claims = new List<Claim> { new("sub", Guid.NewGuid().ToString()) };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        var user = new ClaimsPrincipal(identity);

        var clinicId = Guid.NewGuid();
        var context = new DefaultHttpContext { User = user };
        context.Request.Headers["X-Clinic-Id"] = clinicId.ToString();

        var nextCalled = false;
        RequestDelegate next = _ => { nextCalled = true; return Task.CompletedTask; };
        var middleware = new TenantMiddleware(next, Mock.Of<ILogger<TenantMiddleware>>());

        await middleware.InvokeAsync(context);

        // With empty authorized list, the middleware allows through (no list to validate against)
        nextCalled.Should().BeTrue();
    }

    [Fact]
    public async Task NoXClinicIdHeader_UsesFirstFromClaims()
    {
        var clinic1 = Guid.NewGuid();
        var clinic2 = Guid.NewGuid();
        var user = CreateUserWithClinics(clinic1, clinic2);

        var context = new DefaultHttpContext { User = user };
        // No X-Clinic-Id header

        RequestDelegate next = _ => Task.CompletedTask;
        var middleware = new TenantMiddleware(next, Mock.Of<ILogger<TenantMiddleware>>());

        await middleware.InvokeAsync(context);

        context.Items["TenantClinicId"].Should().Be(clinic1);
    }

    [Fact]
    public async Task XClinicId_InvalidGuid_FallsBackToClaims()
    {
        var clinic1 = Guid.NewGuid();
        var user = CreateUserWithClinics(clinic1);

        var context = new DefaultHttpContext { User = user };
        context.Request.Headers["X-Clinic-Id"] = "not-a-guid";

        RequestDelegate next = _ => Task.CompletedTask;
        var middleware = new TenantMiddleware(next, Mock.Of<ILogger<TenantMiddleware>>());

        await middleware.InvokeAsync(context);

        context.Items["TenantClinicId"].Should().Be(clinic1);
    }
}
