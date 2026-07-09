using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.Infrastructure.Cache;

public class RedisTokenBlacklistService : ITokenBlacklistService
{
    private readonly IDistributedCache _cache;
    private readonly ILogger<RedisTokenBlacklistService> _logger;
    private readonly CacheSettings _settings;

    private static readonly byte[] BlacklistValue = "1"u8.ToArray();

    public RedisTokenBlacklistService(
        IDistributedCache cache,
        IOptions<CacheSettings> settings,
        ILogger<RedisTokenBlacklistService> logger)
    {
        _cache = cache;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task BlacklistTokenAsync(string jti, TimeSpan remainingTtl, CancellationToken ct = default)
    {
        try
        {
            var key = PrefixKey(CacheKeys.TokenBlacklist(jti));

            var options = new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = remainingTtl
            };

            await _cache.SetAsync(key, BlacklistValue, options, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to blacklist token with JTI '{Jti}'.", jti);
        }
    }

    public async Task<bool> IsBlacklistedAsync(string jti, CancellationToken ct = default)
    {
        try
        {
            var key = PrefixKey(CacheKeys.TokenBlacklist(jti));
            var value = await _cache.GetAsync(key, ct);

            return value is not null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to check blacklist for JTI '{Jti}'. Failing open.", jti);
            return false;
        }
    }

    private string PrefixKey(string key) => $"{_settings.InstancePrefix}{key}";
}
