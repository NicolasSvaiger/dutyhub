using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using FluentAssertions;
using Microsoft.Extensions.Options;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Infrastructure.Services;

namespace PlantonHub.UnitTests.Services;

public class JwtTokenServiceTests
{
    private readonly JwtSettings _settings = new()
    {
        Secret = "SuperSecretKeyThatIsAtLeast32CharactersLong!",
        Issuer = "PlantonHub",
        Audience = "PlantonHubClient",
        ExpirationMinutes = 60
    };

    private JwtTokenService CreateService()
    {
        var options = Options.Create(_settings);
        return new JwtTokenService(options);
    }

    [Fact]
    public void GenerateToken_ShouldReturnValidJwtString()
    {
        var service = CreateService();
        var user = new User { Id = Guid.NewGuid(), Email = "test@test.com", Name = "Test" };
        var clinicId = Guid.NewGuid();
        var roles = new[] { RoleType.Medico };

        var token = service.GenerateToken(user, clinicId, roles);

        token.Should().NotBeNullOrWhiteSpace();
        token.Split('.').Should().HaveCount(3); // JWT has 3 parts
    }

    [Fact]
    public void GenerateToken_ShouldContainCorrectClaims()
    {
        var service = CreateService();
        var userId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var user = new User { Id = userId, Email = "test@test.com", Name = "Test" };
        var roles = new[] { RoleType.AdminClinica, RoleType.Medico };

        var token = service.GenerateToken(user, clinicId, roles);

        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(token);

        jwtToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value
            .Should().Be(userId.ToString());
        jwtToken.Claims.First(c => c.Type == "clinicId").Value
            .Should().Be(clinicId.ToString());
        jwtToken.Claims.First(c => c.Type == "roles").Value
            .Should().Be("AdminClinica,Medico");
    }

    [Fact]
    public void GenerateToken_ShouldSetCorrectIssuerAndAudience()
    {
        var service = CreateService();
        var user = new User { Id = Guid.NewGuid(), Email = "test@test.com", Name = "Test" };

        var token = service.GenerateToken(user, Guid.NewGuid(), new[] { RoleType.Medico });

        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(token);

        jwtToken.Issuer.Should().Be("PlantonHub");
        jwtToken.Audiences.Should().Contain("PlantonHubClient");
    }

    [Fact]
    public void GenerateToken_ShouldSetExpiration()
    {
        var service = CreateService();
        var user = new User { Id = Guid.NewGuid(), Email = "test@test.com", Name = "Test" };

        var beforeGeneration = DateTime.UtcNow;
        var token = service.GenerateToken(user, Guid.NewGuid(), new[] { RoleType.Medico });

        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(token);

        jwtToken.ValidTo.Should().BeAfter(beforeGeneration.AddMinutes(59));
        jwtToken.ValidTo.Should().BeBefore(beforeGeneration.AddMinutes(61));
    }

    [Fact]
    public void ValidateToken_WithValidToken_ShouldReturnClaimsPrincipal()
    {
        var service = CreateService();
        var userId = Guid.NewGuid();
        var user = new User { Id = userId, Email = "test@test.com", Name = "Test" };

        var token = service.GenerateToken(user, Guid.NewGuid(), new[] { RoleType.Medico });

        var principal = service.ValidateToken(token);

        principal.Should().NotBeNull();
        principal!.FindFirst(JwtRegisteredClaimNames.Sub)?.Value.Should().Be(userId.ToString());
    }

    [Fact]
    public void ValidateToken_WithInvalidToken_ShouldReturnNull()
    {
        var service = CreateService();

        var result = service.ValidateToken("invalid.token.value");

        result.Should().BeNull();
    }

    [Fact]
    public void ValidateToken_WithTamperedToken_ShouldReturnNull()
    {
        var service = CreateService();
        var user = new User { Id = Guid.NewGuid(), Email = "test@test.com", Name = "Test" };
        var token = service.GenerateToken(user, Guid.NewGuid(), new[] { RoleType.Medico });

        // Tamper with the token by changing a character in the signature
        var tampered = token[..^2] + "XX";

        var result = service.ValidateToken(tampered);

        result.Should().BeNull();
    }

    [Fact]
    public void ValidateToken_WithDifferentSecret_ShouldReturnNull()
    {
        var service = CreateService();
        var user = new User { Id = Guid.NewGuid(), Email = "test@test.com", Name = "Test" };
        var token = service.GenerateToken(user, Guid.NewGuid(), new[] { RoleType.Medico });

        // Create a service with a different secret
        var differentSettings = new JwtSettings
        {
            Secret = "ACompletelyDifferentSecretKeyThatIs32Chars!",
            Issuer = "PlantonHub",
            Audience = "PlantonHubClient",
            ExpirationMinutes = 60
        };
        var differentService = new JwtTokenService(Options.Create(differentSettings));

        var result = differentService.ValidateToken(token);

        result.Should().BeNull();
    }

    // ─────────────────────────────────────────────────────────────
    // Novos testes: claims name / email / clinicIds
    // (introduzidos junto com o suporte multi-clínica no médico)
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public void GenerateToken_ShouldContainEmailClaim()
    {
        var service = CreateService();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "medico@plantonhub.com",
            Name = "Dr. Médico Teste",
        };

        var token = service.GenerateToken(user, Guid.NewGuid(), new[] { RoleType.Medico });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        jwt.Claims.Should().ContainSingle(c => c.Type == JwtRegisteredClaimNames.Email)
            .Which.Value.Should().Be("medico@plantonhub.com");
    }

    [Fact]
    public void GenerateToken_ShouldContainNameClaim()
    {
        var service = CreateService();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "x@x.com",
            Name = "Dr. Médico Teste",
        };

        var token = service.GenerateToken(user, Guid.NewGuid(), new[] { RoleType.Medico });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        jwt.Claims.Should().ContainSingle(c => c.Type == "name")
            .Which.Value.Should().Be("Dr. Médico Teste");
    }

    [Fact]
    public void GenerateToken_WithMultipleUserClinicRoles_ShouldContainAllClinicIdsInClaim()
    {
        var service = CreateService();
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var user = UserWithClinics(clinicA, clinicB);

        var token = service.GenerateToken(user, clinicA, new[] { RoleType.Medico });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        var raw = jwt.Claims.Single(c => c.Type == "clinicIds").Value;
        var ids = raw.Split(',');

        ids.Should().HaveCount(2);
        ids.Should().Contain(clinicA.ToString());
        ids.Should().Contain(clinicB.ToString());
    }

    [Fact]
    public void GenerateToken_WithDuplicateUserClinicRoles_ShouldDeduplicateClinicIds()
    {
        var service = CreateService();
        var clinicA = Guid.NewGuid();
        // Simula um médico com duas roles (Medico + Enfermeiro) na mesma clínica
        var userId = Guid.NewGuid();
        var user = new User { Id = userId, Email = "x@x.com", Name = "X" };
        user.UserClinicRoles.Add(new UserClinicRole
        {
            Id = Guid.NewGuid(), UserId = userId, ClinicId = clinicA, Role = RoleType.Medico,
        });
        user.UserClinicRoles.Add(new UserClinicRole
        {
            Id = Guid.NewGuid(), UserId = userId, ClinicId = clinicA, Role = RoleType.Enfermeiro,
        });

        var token = service.GenerateToken(user, clinicA, new[] { RoleType.Medico });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        var raw = jwt.Claims.Single(c => c.Type == "clinicIds").Value;
        raw.Split(',').Should().ContainSingle().Which.Should().Be(clinicA.ToString());
    }

    [Fact]
    public void GenerateToken_WithNoUserClinicRoles_ShouldContainEmptyClinicIdsClaim()
    {
        var service = CreateService();
        var user = new User { Id = Guid.NewGuid(), Email = "x@x.com", Name = "X" };

        var token = service.GenerateToken(user, Guid.NewGuid(), new[] { RoleType.Medico });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        jwt.Claims.Should().ContainSingle(c => c.Type == "clinicIds")
            .Which.Value.Should().BeEmpty();
    }

    // Helper local: monta um User com N UserClinicRoles.
    private static User UserWithClinics(params Guid[] clinicIds)
    {
        var userId = Guid.NewGuid();
        var user = new User { Id = userId, Email = "medico@test.com", Name = "Médico" };
        foreach (var cid in clinicIds)
        {
            user.UserClinicRoles.Add(new UserClinicRole
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ClinicId = cid,
                Role = RoleType.Medico,
                AssignedAt = DateTime.UtcNow,
            });
        }
        return user;
    }
}
