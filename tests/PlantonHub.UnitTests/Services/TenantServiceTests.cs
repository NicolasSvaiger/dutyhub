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
        => CreateServiceWithClaimsAndHeader(headerClinicId: null, claims);

    /// <summary>
    /// Cria o TenantService com claims E, opcionalmente, com o header
    /// X-Clinic-Id populado. Usado nos testes de multi-clínica.
    /// </summary>
    private TenantService CreateServiceWithClaimsAndHeader(string? headerClinicId, params Claim[] claims)
    {
        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        var httpContext = new DefaultHttpContext { User = principal };
        if (headerClinicId is not null)
        {
            httpContext.Request.Headers["X-Clinic-Id"] = headerClinicId;
        }

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

    // ─────────────────────────────────────────────────────────────
    // Suporte multi-clínica: header X-Clinic-Id + validação contra
    // a claim 'clinicIds' + fallback pro 'clinicId' legado.
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public void GetCurrentClinicId_HeaderWithAuthorizedClinic_ShouldReturnHeaderValue()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var service = CreateServiceWithClaimsAndHeader(
            clinicB.ToString(),
            new Claim("clinicId", clinicA.ToString()),
            new Claim("clinicIds", $"{clinicA},{clinicB}"));

        var result = service.GetCurrentClinicId();

        // Header vence o claim legado quando está autorizado
        result.Should().Be(clinicB);
    }

    [Fact]
    public void GetCurrentClinicId_HeaderWithUnauthorizedClinic_ShouldReturnNull()
    {
        var authorized = Guid.NewGuid();
        var unauthorized = Guid.NewGuid();
        var service = CreateServiceWithClaimsAndHeader(
            unauthorized.ToString(),
            new Claim("clinicId", authorized.ToString()),
            new Claim("clinicIds", authorized.ToString()));

        var result = service.GetCurrentClinicId();

        // Header não pode "escalar" pra uma clínica que o usuário não tem acesso.
        // Retornar null aqui é a defesa: quem chama trata como Unauthorized.
        result.Should().BeNull();
    }

    [Fact]
    public void GetCurrentClinicId_HeaderIsNotAValidGuid_ShouldFallbackToClaim()
    {
        var clinicClaim = Guid.NewGuid();
        var service = CreateServiceWithClaimsAndHeader(
            "not-a-guid",
            new Claim("clinicId", clinicClaim.ToString()));

        var result = service.GetCurrentClinicId();

        // Header inválido é ignorado — cai no claim legado.
        result.Should().Be(clinicClaim);
    }

    [Fact]
    public void GetCurrentClinicId_NoHeader_ShouldFallbackToLegacyClaim()
    {
        var clinicClaim = Guid.NewGuid();
        var service = CreateServiceWithClaims(new Claim("clinicId", clinicClaim.ToString()));

        var result = service.GetCurrentClinicId();

        result.Should().Be(clinicClaim);
    }

    [Fact]
    public void GetAuthorizedClinicIds_WithMultiClaim_ShouldReturnAllValues()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var service = CreateServiceWithClaims(new Claim("clinicIds", $"{a},{b}"));

        var result = service.GetAuthorizedClinicIds().ToList();

        result.Should().HaveCount(2);
        result.Should().Contain(a);
        result.Should().Contain(b);
    }

    [Fact]
    public void GetAuthorizedClinicIds_MergesMultiAndLegacyClaims_Deduplicated()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var service = CreateServiceWithClaims(
            new Claim("clinicId", a.ToString()),
            new Claim("clinicIds", $"{a},{b}"));

        var result = service.GetAuthorizedClinicIds().ToList();

        // 'a' aparece nas duas claims mas o retorno é único
        result.Should().HaveCount(2);
        result.Should().Contain(a);
        result.Should().Contain(b);
    }

    [Fact]
    public void GetAuthorizedClinicIds_OnlyLegacyClaim_ShouldReturnSingleItem()
    {
        var a = Guid.NewGuid();
        var service = CreateServiceWithClaims(new Claim("clinicId", a.ToString()));

        var result = service.GetAuthorizedClinicIds().ToList();

        result.Should().ContainSingle().Which.Should().Be(a);
    }

    [Fact]
    public void GetAuthorizedClinicIds_NoClaims_ShouldReturnEmpty()
    {
        var service = CreateServiceWithClaims();

        var result = service.GetAuthorizedClinicIds();

        result.Should().BeEmpty();
    }

    [Fact]
    public void GetAuthorizedClinicIds_MalformedGuidInList_ShouldSkipItAndKeepValidOnes()
    {
        var valid = Guid.NewGuid();
        var service = CreateServiceWithClaims(
            new Claim("clinicIds", $"{valid},not-a-guid, ,{Guid.Empty}"));

        var result = service.GetAuthorizedClinicIds().ToList();

        // Empty Guid é um Guid válido — só o "not-a-guid" deve ser descartado.
        result.Should().Contain(valid);
        result.Should().Contain(Guid.Empty);
        result.Should().NotContain(g => g.ToString() == "not-a-guid");
    }
}
