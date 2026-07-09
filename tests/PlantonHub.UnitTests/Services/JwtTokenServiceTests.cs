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
}
