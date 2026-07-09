namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Service for acquiring distributed locks using Redis.
/// Used to prevent race conditions during concurrent processing of the same event.
/// </summary>
public interface IDistributedLockService
{
    /// <summary>
    /// Attempts to acquire a distributed lock for the given key.
    /// Returns true if the lock was acquired, false if it's already held.
    /// </summary>
    /// <param name="lockKey">Unique key identifying the resource to lock.</param>
    /// <param name="ttl">Time-to-live for the lock (auto-releases after this period).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>True if lock acquired; false if already held by another process.</returns>
    Task<bool> TryAcquireLockAsync(string lockKey, TimeSpan ttl, CancellationToken ct = default);

    /// <summary>
    /// Releases the distributed lock for the given key.
    /// </summary>
    /// <param name="lockKey">Unique key identifying the resource to unlock.</param>
    /// <param name="ct">Cancellation token.</param>
    Task ReleaseLockAsync(string lockKey, CancellationToken ct = default);

    /// <summary>
    /// Checks if an idempotency key exists in the short-TTL cache (immediate re-send detection).
    /// </summary>
    /// <param name="idempotencyKey">The idempotency key to check.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>True if the key already exists (duplicate detected).</returns>
    Task<bool> ExistsIdempotencyKeyAsync(string idempotencyKey, CancellationToken ct = default);

    /// <summary>
    /// Sets an idempotency key with a short TTL for immediate re-send detection.
    /// </summary>
    /// <param name="idempotencyKey">The idempotency key to set.</param>
    /// <param name="ttl">Time-to-live for the idempotency entry.</param>
    /// <param name="ct">Cancellation token.</param>
    Task SetIdempotencyKeyAsync(string idempotencyKey, TimeSpan ttl, CancellationToken ct = default);

    /// <summary>
    /// Increments a counter in Redis for the given key and returns the new value.
    /// Sets the TTL on first creation. Used for replay attack detection.
    /// </summary>
    /// <param name="key">The counter key.</param>
    /// <param name="ttl">Time-to-live for the counter (window duration).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The current counter value after increment, or 0 if Redis is unavailable.</returns>
    Task<long> IncrementCounterAsync(string key, TimeSpan ttl, CancellationToken ct = default);

    /// <summary>
    /// Checks if the sync rate limit has been exceeded for a given user/device combination.
    /// Increments a counter per user+device per time window and returns true if the limit is exceeded.
    /// </summary>
    /// <param name="userId">The user ID.</param>
    /// <param name="deviceId">The device identifier.</param>
    /// <param name="maxRequests">Maximum allowed sync requests in the time window.</param>
    /// <param name="window">The time window for rate limiting.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>True if the rate limit is exceeded; false otherwise. Returns false if Redis is unavailable (fail-open).</returns>
    Task<bool> IsRateLimitedAsync(Guid userId, string deviceId, int maxRequests, TimeSpan window, CancellationToken ct = default);
}
