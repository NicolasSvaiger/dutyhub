using Microsoft.Extensions.Logging;
using PlantonHub.Application.Interfaces;
using StackExchange.Redis;

namespace PlantonHub.Infrastructure.Cache;

/// <summary>
/// Redis-based distributed lock and idempotency service.
/// Uses SETNX (SET if Not eXists) with TTL for lock acquisition.
/// Provides short-TTL idempotency keys for immediate re-send detection.
/// Falls back gracefully if Redis is unavailable.
/// </summary>
public class RedisDistributedLockService : IDistributedLockService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<RedisDistributedLockService> _logger;

    private const string LockPrefix = "plantonhub:lock:sync:";
    private const string IdempotencyPrefix = "plantonhub:idempotency:sync:";
    private const string RateLimitPrefix = "plantonhub:ratelimit:sync:";

    public RedisDistributedLockService(
        IConnectionMultiplexer redis,
        ILogger<RedisDistributedLockService> logger)
    {
        _redis = redis;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<bool> TryAcquireLockAsync(string lockKey, TimeSpan ttl, CancellationToken ct = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var fullKey = $"{LockPrefix}{lockKey}";

            // SETNX with TTL: atomic operation that sets value only if key doesn't exist
            var acquired = await db.StringSetAsync(
                fullKey,
                "locked",
                ttl,
                When.NotExists);

            if (!acquired)
            {
                _logger.LogDebug("Lock not acquired for key '{LockKey}' — already held.", lockKey);
            }

            return acquired;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to acquire distributed lock for key '{LockKey}'. Proceeding without lock (fail-open).", lockKey);
            // Fail-open: if Redis is unavailable, allow processing to continue
            return true;
        }
    }

    /// <inheritdoc />
    public async Task ReleaseLockAsync(string lockKey, CancellationToken ct = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var fullKey = $"{LockPrefix}{lockKey}";
            await db.KeyDeleteAsync(fullKey);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to release distributed lock for key '{LockKey}'.", lockKey);
            // Lock will auto-expire via TTL, so this is not critical
        }
    }

    /// <inheritdoc />
    public async Task<bool> ExistsIdempotencyKeyAsync(string idempotencyKey, CancellationToken ct = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var fullKey = $"{IdempotencyPrefix}{idempotencyKey}";
            return await db.KeyExistsAsync(fullKey);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to check idempotency key '{Key}'. Proceeding without cache check (fail-open).", idempotencyKey);
            // Fail-open: if Redis is unavailable, fall through to DB check
            return false;
        }
    }

    /// <inheritdoc />
    public async Task SetIdempotencyKeyAsync(string idempotencyKey, TimeSpan ttl, CancellationToken ct = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var fullKey = $"{IdempotencyPrefix}{idempotencyKey}";
            await db.StringSetAsync(fullKey, "1", ttl);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to set idempotency key '{Key}'. Idempotency still guaranteed via DB constraint.", idempotencyKey);
        }
    }

    /// <inheritdoc />
    public async Task<long> IncrementCounterAsync(string key, TimeSpan ttl, CancellationToken ct = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var fullKey = $"plantonhub:{key}";

            // Increment the counter atomically
            var newValue = await db.StringIncrementAsync(fullKey);

            // Set TTL only on first creation (when value becomes 1)
            if (newValue == 1)
            {
                await db.KeyExpireAsync(fullKey, ttl);
            }

            return newValue;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to increment counter for key '{Key}'. Returning 0 (fail-open).", key);
            // Fail-open: if Redis is unavailable, don't flag replay attacks
            return 0;
        }
    }

    /// <inheritdoc />
    public async Task<bool> IsRateLimitedAsync(Guid userId, string deviceId, int maxRequests, TimeSpan window, CancellationToken ct = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var fullKey = $"{RateLimitPrefix}{userId}:{deviceId}";

            // Increment the counter atomically
            var currentCount = await db.StringIncrementAsync(fullKey);

            // Set TTL only on first creation (when value becomes 1)
            if (currentCount == 1)
            {
                await db.KeyExpireAsync(fullKey, window);
            }

            return currentCount > maxRequests;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to check rate limit for user '{UserId}', device '{DeviceId}'. Proceeding without rate limit (fail-open).", userId, deviceId);
            // Fail-open: if Redis is unavailable, allow the request
            return false;
        }
    }
}
