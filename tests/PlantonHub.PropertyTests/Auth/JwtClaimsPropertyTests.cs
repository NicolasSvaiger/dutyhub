using System.IdentityModel.Tokens.Jwt;
using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.Extensions.Options;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Infrastructure.Services;

namespace PlantonHub.PropertyTests.Auth;

/// <summary>
/// **Validates: Requirements 1.1, 1.5**
/// Property 1: Claims do JWT contêm dados corretos do usuário
/// For any valid user with any combination of roles and clinics,
/// the generated JWT token SHALL contain correct sub, clinicId, and roles claims.
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class JwtClaimsPropertyTests
{
    private static readonly JwtTokenService _jwtTokenService;
    private static readonly JwtSecurityTokenHandler _tokenHandler = new();

    static JwtClaimsPropertyTests()
    {
        var jwtSettings = Options.Create(new JwtSettings
        {
            Secret = "TestSecretKeyThatIsAtLeast32CharactersLong123456",
            Issuer = "TestIssuer",
            Audience = "TestAudience",
            ExpirationMinutes = 60
        });
        _jwtTokenService = new JwtTokenService(jwtSettings);
    }

    [Property(MaxTest = 100)]
    public Property JwtToken_SubClaim_MatchesUserId()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            (userId, clinicId) =>
            {
                var user = new User
                {
                    Id = userId,
                    Email = "test@example.com",
                    Name = "Test User",
                    PasswordHash = "hashed",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                var roles = new List<RoleType> { RoleType.Medico };

                var tokenString = _jwtTokenService.GenerateToken(user, clinicId, roles);
                var token = _tokenHandler.ReadJwtToken(tokenString);

                var subClaim = token.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value;

                return (subClaim == userId.ToString()).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property JwtToken_ClinicIdClaim_MatchesProvidedClinicId()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            (userId, clinicId) =>
            {
                var user = new User
                {
                    Id = userId,
                    Email = "test@test.com",
                    Name = "Test",
                    PasswordHash = "hashed",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                var roles = new List<RoleType> { RoleType.AdminClinica };

                var tokenString = _jwtTokenService.GenerateToken(user, clinicId, roles);
                var token = _tokenHandler.ReadJwtToken(tokenString);

                var clinicIdClaim = token.Claims.First(c => c.Type == "clinicId").Value;

                return (clinicIdClaim == clinicId.ToString()).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property JwtToken_RolesClaim_ContainsAllProvidedRoles()
    {
        var roleGen = Gen.Elements(
            RoleType.AdminGlobal,
            RoleType.AdminClinica,
            RoleType.Medico,
            RoleType.Enfermeiro,
            RoleType.Tecnico);

        var rolesListGen = Gen.NonEmptyListOf(roleGen)
            .Select(list => list.Distinct().ToList());

        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(rolesListGen),
            (userId, clinicId, roles) =>
            {
                var user = new User
                {
                    Id = userId,
                    Email = "test@test.com",
                    Name = "Test",
                    PasswordHash = "hashed",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                var tokenString = _jwtTokenService.GenerateToken(user, clinicId, roles);
                var token = _tokenHandler.ReadJwtToken(tokenString);

                var rolesClaim = token.Claims.First(c => c.Type == "roles").Value;
                var claimedRoles = rolesClaim.Split(',').ToHashSet();
                var expectedRoles = roles.Select(r => r.ToString()).ToHashSet();

                return claimedRoles.SetEquals(expectedRoles).ToProperty();
            });
    }
}
