using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Auth;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ITokenBlacklistService _tokenBlacklistService;

    public AuthController(IAuthService authService, ITokenBlacklistService tokenBlacklistService)
    {
        _authService = authService;
        _tokenBlacklistService = tokenBlacklistService;
    }

    /// <summary>
    /// Autenticar usuário com email e senha.
    /// </summary>
    [AllowAnonymous]
    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var response = await _authService.LoginAsync(request);
        return Ok(response);
    }

    /// <summary>
    /// Renovar tokens usando refresh token válido.
    /// </summary>
    [AllowAnonymous]
    [HttpPost("refresh-token")]
    [ProducesResponseType(typeof(RefreshTokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest request)
    {
        var response = await _authService.RefreshTokenAsync(request);
        return Ok(response);
    }

    /// <summary>
    /// Encerrar sessão do usuário, invalidando o token atual via blacklist.
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Logout()
    {
        // 1. Extract JTI from the current token's claims
        var jti = User.Claims.FirstOrDefault(c => c.Type == "jti")?.Value;
        if (string.IsNullOrEmpty(jti))
        {
            return NoContent(); // No JTI to blacklist
        }

        // 2. Calculate remaining time until token expiration from "exp" claim
        var expClaim = User.Claims.FirstOrDefault(c => c.Type == "exp")?.Value;
        if (expClaim is null || !long.TryParse(expClaim, out var expUnix))
        {
            return NoContent(); // Can't determine expiration
        }

        var expirationTime = DateTimeOffset.FromUnixTimeSeconds(expUnix);
        var remainingTtl = expirationTime - DateTimeOffset.UtcNow;

        if (remainingTtl <= TimeSpan.Zero)
        {
            return NoContent(); // Token already expired
        }

        // 3. Blacklist the token
        await _tokenBlacklistService.BlacklistTokenAsync(jti, remainingTtl);

        // 4. Return 204 No Content
        return NoContent();
    }
}
