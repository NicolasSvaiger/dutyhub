using System.Security.Cryptography;
using PlantonHub.Application.DTOs.Auth;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class AuthService : IAuthService
{
    private readonly IUserRepository _userRepository;
    private readonly IPasswordHashService _passwordHashService;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IRefreshTokenRepository _refreshTokenRepository;

    public AuthService(
        IUserRepository userRepository,
        IPasswordHashService passwordHashService,
        IJwtTokenService jwtTokenService,
        IRefreshTokenRepository refreshTokenRepository)
    {
        _userRepository = userRepository;
        _passwordHashService = passwordHashService;
        _jwtTokenService = jwtTokenService;
        _refreshTokenRepository = refreshTokenRepository;
    }

    public async Task<LoginResponse> LoginAsync(LoginRequest request)
    {
        var user = await _userRepository.GetByEmailAsync(request.Email);
        if (user is null)
        {
            throw new UnauthorizedException("Invalid credentials.");
        }

        if (!_passwordHashService.VerifyPassword(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedException("Invalid credentials.");
        }

        var roles = user.UserClinicRoles.Select(ucr => ucr.Role).Distinct().ToList();
        var clinicId = user.UserClinicRoles.FirstOrDefault()?.ClinicId ?? Guid.Empty;

        var token = _jwtTokenService.GenerateToken(user, clinicId, roles);
        var refreshToken = GenerateRefreshToken();

        var refreshTokenEntity = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = refreshToken,
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            IsRevoked = false,
            CreatedAt = DateTime.UtcNow
        };

        await _refreshTokenRepository.AddAsync(refreshTokenEntity);

        return new LoginResponse
        {
            Token = token,
            RefreshToken = refreshToken
        };
    }

    public async Task<RefreshTokenResponse> RefreshTokenAsync(RefreshTokenRequest request)
    {
        var existingToken = await _refreshTokenRepository.GetByTokenAsync(request.RefreshToken);

        if (existingToken is null || existingToken.IsRevoked || existingToken.ExpiresAt <= DateTime.UtcNow)
        {
            throw new UnauthorizedException("Invalid or expired refresh token.");
        }

        // Revoke old token
        existingToken.IsRevoked = true;
        await _refreshTokenRepository.UpdateAsync(existingToken);

        var user = existingToken.User;
        var roles = user.UserClinicRoles.Select(ucr => ucr.Role).Distinct().ToList();
        var clinicId = user.UserClinicRoles.FirstOrDefault()?.ClinicId ?? Guid.Empty;

        var newJwtToken = _jwtTokenService.GenerateToken(user, clinicId, roles);
        var newRefreshToken = GenerateRefreshToken();

        var newRefreshTokenEntity = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = newRefreshToken,
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            IsRevoked = false,
            CreatedAt = DateTime.UtcNow
        };

        await _refreshTokenRepository.AddAsync(newRefreshTokenEntity);

        return new RefreshTokenResponse
        {
            Token = newJwtToken,
            RefreshToken = newRefreshToken
        };
    }

    private static string GenerateRefreshToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
    }
}
