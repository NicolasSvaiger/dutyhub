using System.IdentityModel.Tokens.Jwt;
using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.Extensions.Options;
using Moq;
using PlantonHub.Application.DTOs.Auth;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Services;

namespace PlantonHub.PropertyTests.Auth;

/// <summary>
/// **Validates: Requirements 1.3**
/// Property 3: Refresh token preserva claims (round-trip)
/// For any authenticated user, after refresh, the new JWT token SHALL contain
/// the same claims (UserId, roles, ClinicId) as the original.
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class RefreshTokenRoundTripPropertyTests
{
    private static readonly JwtSecurityTokenHandler _tokenHandler = new();

    private static JwtTokenService CreateJwtTokenService()
    {
        var jwtSettings = Options.Create(new JwtSettings
        {
            Secret = "TestSecretKeyThatIsAtLeast32CharactersLong123456",
            Issuer = "TestIssuer",
            Audience = "TestAudience",
            ExpirationMinutes = 60
        });
        return new JwtTokenService(jwtSettings);
    }

    [Property(MaxTest = 100)]
    public Property RefreshToken_PreservesAllClaims_AfterRoundTrip()
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
                var jwtTokenService = CreateJwtTokenService();

                var user = new User
                {
                    Id = userId,
                    Email = "user@test.com",
                    Name = "Test User",
                    PasswordHash = "hashed",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    UserClinicRoles = roles.Select(r => new UserClinicRole
                    {
                        Id = Guid.NewGuid(),
                        UserId = userId,
                        ClinicId = clinicId,
                        Role = r,
                        AssignedAt = DateTime.UtcNow
                    }).ToList()
                };

                // Step 1: Login - generate initial token
                var userRepo = new Mock<IUserRepository>();
                userRepo.Setup(r => r.GetByEmailAsync("user@test.com"))
                    .ReturnsAsync(user);

                var passwordHashService = new Mock<IPasswordHashService>();
                passwordHashService.Setup(p => p.VerifyPassword("password", "hashed"))
                    .Returns(true);

                var refreshTokenRepo = new Mock<IRefreshTokenRepository>();
                RefreshToken? savedRefreshToken = null;
                refreshTokenRepo.Setup(r => r.AddAsync(It.IsAny<RefreshToken>()))
                    .Callback<RefreshToken>(rt => savedRefreshToken = rt)
                    .Returns(Task.CompletedTask);

                var authService = new AuthService(
                    userRepo.Object,
                    passwordHashService.Object,
                    jwtTokenService,
                    refreshTokenRepo.Object);

                var loginResponse = authService.LoginAsync(new LoginRequest
                {
                    Email = "user@test.com",
                    Password = "password"
                }).Result;

                // Step 2: Refresh - set up repo to return the saved token with navigation property
                savedRefreshToken!.User = user;
                refreshTokenRepo.Setup(r => r.GetByTokenAsync(savedRefreshToken.Token))
                    .ReturnsAsync(savedRefreshToken);
                refreshTokenRepo.Setup(r => r.UpdateAsync(It.IsAny<RefreshToken>()))
                    .Returns(Task.CompletedTask);

                var refreshResponse = authService.RefreshTokenAsync(new RefreshTokenRequest
                {
                    RefreshToken = savedRefreshToken.Token
                }).Result;

                // Step 3: Compare claims between original and refreshed tokens
                var originalToken = _tokenHandler.ReadJwtToken(loginResponse.Token);
                var refreshedToken = _tokenHandler.ReadJwtToken(refreshResponse.Token);

                var originalSub = originalToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value;
                var refreshedSub = refreshedToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value;

                var originalClinicId = originalToken.Claims.First(c => c.Type == "clinicId").Value;
                var refreshedClinicId = refreshedToken.Claims.First(c => c.Type == "clinicId").Value;

                var originalRoles = originalToken.Claims.First(c => c.Type == "roles").Value;
                var refreshedRoles = refreshedToken.Claims.First(c => c.Type == "roles").Value;

                var subMatch = originalSub == refreshedSub;
                var clinicMatch = originalClinicId == refreshedClinicId;

                var originalRolesSet = originalRoles.Split(',').ToHashSet();
                var refreshedRolesSet = refreshedRoles.Split(',').ToHashSet();
                var rolesMatch = originalRolesSet.SetEquals(refreshedRolesSet);

                return (subMatch && clinicMatch && rolesMatch).ToProperty();
            });
    }
}
