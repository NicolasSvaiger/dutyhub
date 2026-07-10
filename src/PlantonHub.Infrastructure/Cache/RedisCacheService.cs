using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PlantonHub.Application.Interfaces;
using StackExchange.Redis;

namespace PlantonHub.Infrastructure.Cache;

public class RedisCacheService : ICacheService
{
    private readonly IDistributedCache _cache;
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<RedisCacheService> _logger;
    private readonly CacheSettings _settings;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public RedisCacheService(
        IDistributedCache cache,
        IConnectionMultiplexer redis,
        IOptions<CacheSettings> settings,
        ILogger<RedisCacheService> logger)
    {
        _cache = cache;
        _redis = redis;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            var bytes = await _cache.GetAsync(prefixedKey, ct);

            if (bytes is null)
                return default;

            return JsonSerializer.Deserialize<T>(bytes, JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read from cache for key '{Key}'. Returning default.", key);
            return default;
        }
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            var bytes = JsonSerializer.SerializeToUtf8Bytes(value, JsonOptions);

            var options = new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = ttl ?? TimeSpan.FromMinutes(_settings.DefaultTtlMinutes)
            };

            await _cache.SetAsync(prefixedKey, bytes, options, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to write to cache for key '{Key}'.", key);
        }
    }

    public async Task<T?> GetOrSetAsync<T>(string key, Func<Task<T>> factory, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        var cached = await GetAsync<T>(key, ct);

        if (cached is not null)
            return cached;

        var value = await factory();

        if (value is not null)
            await SetAsync(key, value, ttl, ct);

        return value;
    }

    public async Task RemoveAsync(string key, CancellationToken ct = default)
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            await _cache.RemoveAsync(prefixedKey, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to remove cache entry for key '{Key}'.", key);
        }
    }

    public async Task RemoveByPrefixAsync(string prefix, CancellationToken ct = default)
    {
        try
        {
            var prefixedPattern = $"{PrefixKey(prefix)}*";
            var endpoints = _redis.GetEndPoints();

            foreach (var endpoint in endpoints)
            {
                var server = _redis.GetServer(endpoint);
                var keys = server.KeysAsync(pattern: prefixedPattern);

                await foreach (var key in keys.WithCancellation(ct))
                {
                    var db = _redis.GetDatabase();
                    await db.KeyDeleteAsync(key);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to remove cache entries by prefix '{Prefix}'.", prefix);
        }
    }

    private string PrefixKey(string key) => $"{_settings.InstancePrefix}{key}";
}
