using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

/// <summary>
/// Auth controller — handles token blacklisting for logout.
/// Login and refresh are handled client-side via AWS Cognito SDK.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly ITokenBlacklistService _tokenBlacklistService;

    public AuthController(ITokenBlacklistService tokenBlacklistService)
    {
        _tokenBlacklistService = tokenBlacklistService;
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
