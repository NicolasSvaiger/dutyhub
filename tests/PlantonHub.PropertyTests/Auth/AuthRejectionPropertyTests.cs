using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.Extensions.Options;
using Moq;
using PlantonHub.Application.DTOs.Auth;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Services;

namespace PlantonHub.PropertyTests.Auth;

/// <summary>
/// **Validates: Requirements 1.1, 1.2, 1.4**
/// Property 2: Credenciais e tokens inválidos são rejeitados
/// For any combination of invalid credentials or invalid/expired refresh tokens,
/// the service SHALL throw UnauthorizedException.
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class AuthRejectionPropertyTests
{
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
    public Property LoginAsync_UserNotFound_ThrowsUnauthorizedException()
    {
        return Prop.ForAll(
            Arb.From<NonEmptyString>(),
            Arb.From<NonEmptyString>(),
            (email, password) =>
            {
                var userRepo = new Mock<IUserRepository>();
                userRepo.Setup(r => r.GetByEmailAsync(It.IsAny<string>()))
                    .ReturnsAsync((User?)null);

                var passwordHashService = new Mock<IPasswordHashService>();
                var jwtTokenService = CreateJwtTokenService();
                var refreshTokenRepo = new Mock<IRefreshTokenRepository>();

                var authService = new AuthService(
                    userRepo.Object,
                    passwordHashService.Object,
                    jwtTokenService,
                    refreshTokenRepo.Object);

                var request = new LoginRequest
                {
                    Email = email.Get,
                    Password = password.Get
                };

                var act = () => authService.LoginAsync(request);

                act.Should().ThrowAsync<UnauthorizedException>().Wait();

                return true.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property LoginAsync_WrongPassword_ThrowsUnauthorizedException()
    {
        return Prop.ForAll(
            Arb.From<NonEmptyString>(),
            Arb.From<NonEmptyString>(),
            (email, password) =>
            {
                var user = new User
                {
                    Id = Guid.NewGuid(),
                    Email = email.Get,
                    Name = "Test User",
                    PasswordHash = "someHash",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    UserClinicRoles = new List<UserClinicRole>
                    {
                        new UserClinicRole
                        {
                            Id = Guid.NewGuid(),
                            UserId = Guid.NewGuid(),
                            ClinicId = Guid.NewGuid(),
                            Role = RoleType.Medico,
                            AssignedAt = DateTime.UtcNow
                        }
                    }
                };

                var userRepo = new Mock<IUserRepository>();
                userRepo.Setup(r => r.GetByEmailAsync(email.Get))
                    .ReturnsAsync(user);

                var passwordHashService = new Mock<IPasswordHashService>();
                passwordHashService.Setup(p => p.VerifyPassword(It.IsAny<string>(), It.IsAny<string>()))
                    .Returns(false);

                var jwtTokenService = CreateJwtTokenService();
                var refreshTokenRepo = new Mock<IRefreshTokenRepository>();

                var authService = new AuthService(
                    userRepo.Object,
                    passwordHashService.Object,
                    jwtTokenService,
                    refreshTokenRepo.Object);

                var request = new LoginRequest
                {
                    Email = email.Get,
                    Password = password.Get
                };

                var act = () => authService.LoginAsync(request);

                act.Should().ThrowAsync<UnauthorizedException>().Wait();

                return true.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property RefreshTokenAsync_TokenNotFound_ThrowsUnauthorizedException()
    {
        return Prop.ForAll(
            Arb.From<NonEmptyString>(),
            (tokenValue) =>
            {
                var userRepo = new Mock<IUserRepository>();
                var passwordHashService = new Mock<IPasswordHashService>();
                var jwtTokenService = CreateJwtTokenService();
                var refreshTokenRepo = new Mock<IRefreshTokenRepository>();

                refreshTokenRepo.Setup(r => r.GetByTokenAsync(It.IsAny<string>()))
                    .ReturnsAsync((RefreshToken?)null);

                var authService = new AuthService(
                    userRepo.Object,
                    passwordHashService.Object,
                    jwtTokenService,
                    refreshTokenRepo.Object);

                var request = new RefreshTokenRequest
                {
                    RefreshToken = tokenValue.Get
                };

                var act = () => authService.RefreshTokenAsync(request);

                act.Should().ThrowAsync<UnauthorizedException>().Wait();

                return true.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property RefreshTokenAsync_RevokedToken_ThrowsUnauthorizedException()
    {
        return Prop.ForAll(
            Arb.From<NonEmptyString>(),
            (tokenValue) =>
            {
                var userRepo = new Mock<IUserRepository>();
                var passwordHashService = new Mock<IPasswordHashService>();
                var jwtTokenService = CreateJwtTokenService();
                var refreshTokenRepo = new Mock<IRefreshTokenRepository>();

                var revokedToken = new RefreshToken
                {
                    Id = Guid.NewGuid(),
                    UserId = Guid.NewGuid(),
                    Token = tokenValue.Get,
                    ExpiresAt = DateTime.UtcNow.AddDays(7),
                    IsRevoked = true,
                    CreatedAt = DateTime.UtcNow
                };

                refreshTokenRepo.Setup(r => r.GetByTokenAsync(tokenValue.Get))
                    .ReturnsAsync(revokedToken);

                var authService = new AuthService(
                    userRepo.Object,
                    passwordHashService.Object,
                    jwtTokenService,
                    refreshTokenRepo.Object);

                var request = new RefreshTokenRequest
                {
                    RefreshToken = tokenValue.Get
                };

                var act = () => authService.RefreshTokenAsync(request);

                act.Should().ThrowAsync<UnauthorizedException>().Wait();

                return true.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property RefreshTokenAsync_ExpiredToken_ThrowsUnauthorizedException()
    {
        return Prop.ForAll(
            Arb.From<NonEmptyString>(),
            (tokenValue) =>
            {
                var userRepo = new Mock<IUserRepository>();
                var passwordHashService = new Mock<IPasswordHashService>();
                var jwtTokenService = CreateJwtTokenService();
                var refreshTokenRepo = new Mock<IRefreshTokenRepository>();

                var expiredToken = new RefreshToken
                {
                    Id = Guid.NewGuid(),
                    UserId = Guid.NewGuid(),
                    Token = tokenValue.Get,
                    ExpiresAt = DateTime.UtcNow.AddDays(-1),
                    IsRevoked = false,
                    CreatedAt = DateTime.UtcNow.AddDays(-8)
                };

                refreshTokenRepo.Setup(r => r.GetByTokenAsync(tokenValue.Get))
                    .ReturnsAsync(expiredToken);

                var authService = new AuthService(
                    userRepo.Object,
                    passwordHashService.Object,
                    jwtTokenService,
                    refreshTokenRepo.Object);

                var request = new RefreshTokenRequest
                {
                    RefreshToken = tokenValue.Get
                };

                var act = () => authService.RefreshTokenAsync(request);

                act.Should().ThrowAsync<UnauthorizedException>().Wait();

                return true.ToProperty();
            });
    }
}
