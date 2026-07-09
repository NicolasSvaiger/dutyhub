using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Moq;
using PlantonHub.Infrastructure.Services;

namespace PlantonHub.UnitTests.Services;

public class TenantServiceTests
{
    private TenantService CreateServiceWithClaims(params Claim[] claims)
    {
        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        var httpContext = new DefaultHttpContext { User = principal };
        var accessor = new Mock<IHttpContextAccessor>();
        accessor.Setup(a => a.HttpContext).Returns(httpContext);

        return new TenantService(accessor.Object);
    }

    private TenantService CreateServiceWithNoContext()
    {
        var accessor = new Mock<IHttpContextAccessor>();
        accessor.Setup(a => a.HttpContext).Returns((HttpContext?)null);
        return new TenantService(accessor.Object);
    }

    [Fact]
    public void GetCurrentClinicId_WithValidClaim_ShouldReturnGuid()
    {
        var clinicId = Guid.NewGuid();
        var service = CreateServiceWithClaims(new Claim("clinicId", clinicId.ToString()));

        var result = service.GetCurrentClinicId();

        result.Should().Be(clinicId);
    }

    [Fact]
    public void GetCurrentClinicId_WithNoClaim_ShouldReturnNull()
    {
        var service = CreateServiceWithClaims();

        var result = service.GetCurrentClinicId();

        result.Should().BeNull();
    }

    [Fact]
    public void GetCurrentClinicId_WithInvalidGuid_ShouldReturnNull()
    {
        var service = CreateServiceWithClaims(new Claim("clinicId", "not-a-guid"));

        var result = service.GetCurrentClinicId();

        result.Should().BeNull();
    }

    [Fact]
    public void GetCurrentClinicId_WithNoHttpContext_ShouldReturnNull()
    {
        var service = CreateServiceWithNoContext();

        var result = service.GetCurrentClinicId();

        result.Should().BeNull();
    }

    [Fact]
    public void GetCurrentUserId_WithValidSubClaim_ShouldReturnGuid()
    {
        var userId = Guid.NewGuid();
        var service = CreateServiceWithClaims(new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()));

        var result = service.GetCurrentUserId();

        result.Should().Be(userId);
    }

    [Fact]
    public void GetCurrentUserId_WithSubStringClaim_ShouldReturnGuid()
    {
        var userId = Guid.NewGuid();
        var service = CreateServiceWithClaims(new Claim("sub", userId.ToString()));

        var result = service.GetCurrentUserId();

        result.Should().Be(userId);
    }

    [Fact]
    public void GetCurrentUserId_WithNoClaim_ShouldReturnNull()
    {
        var service = CreateServiceWithClaims();

        var result = service.GetCurrentUserId();

        result.Should().BeNull();
    }

    [Fact]
    public void GetCurrentRoles_WithRolesClaim_ShouldReturnParsedRoles()
    {
        var service = CreateServiceWithClaims(new Claim("roles", "AdminGlobal,Medico"));

        var result = service.GetCurrentRoles().ToList();

        result.Should().HaveCount(2);
        result.Should().Contain("AdminGlobal");
        result.Should().Contain("Medico");
    }

    [Fact]
    public void GetCurrentRoles_WithSingleRole_ShouldReturnSingleRole()
    {
        var service = CreateServiceWithClaims(new Claim("roles", "Medico"));

        var result = service.GetCurrentRoles().ToList();

        result.Should().HaveCount(1);
        result.Should().Contain("Medico");
    }

    [Fact]
    public void GetCurrentRoles_WithNoClaim_ShouldReturnEmpty()
    {
        var service = CreateServiceWithClaims();

        var result = service.GetCurrentRoles();

        result.Should().BeEmpty();
    }

    [Fact]
    public void IsAdminGlobal_WithAdminGlobalRole_ShouldReturnTrue()
    {
        var service = CreateServiceWithClaims(new Claim("roles", "AdminGlobal,Medico"));

        var result = service.IsAdminGlobal();

        result.Should().BeTrue();
    }

    [Fact]
    public void IsAdminGlobal_WithoutAdminGlobalRole_ShouldReturnFalse()
    {
        var service = CreateServiceWithClaims(new Claim("roles", "Medico,Enfermeiro"));

        var result = service.IsAdminGlobal();

        result.Should().BeFalse();
    }

    [Fact]
    public void IsAdminGlobal_WithNoRoles_ShouldReturnFalse()
    {
        var service = CreateServiceWithClaims();

        var result = service.IsAdminGlobal();

        result.Should().BeFalse();
    }
}
