namespace PlantonHub.Application.Interfaces;

public interface ITokenBlacklistService
{
    /// <summary>
    /// Adiciona um token à blacklist com TTL baseado na expiração do token.
    /// </summary>
    Task BlacklistTokenAsync(string jti, TimeSpan remainingTtl, CancellationToken ct = default);

    /// <summary>
    /// Verifica se um token está na blacklist.
    /// </summary>
    Task<bool> IsBlacklistedAsync(string jti, CancellationToken ct = default);
}
