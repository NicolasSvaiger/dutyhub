using System.Security.Cryptography;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.Infrastructure.Services;

/// <summary>
/// Redis-backed biometric proof token service.
/// Issues cryptographically random tokens with a 5-minute TTL.
/// Tokens are single-use: consumed (deleted) on validation.
/// </summary>
public class RedisBiometricProofService : IBiometricProofService
{
    private readonly ICacheService _cache;
    private static readonly TimeSpan TokenTtl = TimeSpan.FromMinutes(5);
    private const string KeyPrefix = "biometric-proof:";

    public RedisBiometricProofService(ICacheService cache)
    {
        _cache = cache;
    }

    public async Task<string> IssueTokenAsync(Guid userId, CancellationToken ct = default)
    {
        // Generate a cryptographically secure random token
        var tokenBytes = RandomNumberGenerator.GetBytes(32);
        var token = Convert.ToBase64String(tokenBytes);

        // Store in Redis: key = biometric-proof:{userId}, value = token, TTL = 5min
        var key = $"{KeyPrefix}{userId}";
        await _cache.SetAsync(key, token, TokenTtl, ct);

        return token;
    }

    public async Task<bool> ValidateAndConsumeAsync(Guid userId, string token, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token))
            return false;

        var key = $"{KeyPrefix}{userId}";
        var storedToken = await _cache.GetAsync<string>(key, ct);

        if (storedToken is null)
            return false;

        // Constant-time comparison to prevent timing attacks
        if (!CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(storedToken),
            System.Text.Encoding.UTF8.GetBytes(token)))
        {
            return false;
        }

        // Consume: delete the token so it can't be reused
        await _cache.RemoveAsync(key, ct);
        return true;
    }
}
