using System.Text.Json;
using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using PlantonHub.Infrastructure.Cache;
using StackExchange.Redis;

namespace PlantonHub.PropertyTests.Cache;

/// <summary>
/// Property-based tests for cache-aside pattern and TTL behavior.
/// Validates: Requirements 3.1, 3.2, 4.1, 4.2, 5.1, 5.2
/// </summary>
[Trait("Feature", "redis-cache-layer")]
public class CacheAsideProperties
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private static RedisCacheService CreateService(
        Mock<IDistributedCache> cacheMock,
        int defaultTtlMinutes = 5)
    {
        var redisMock = new Mock<IConnectionMultiplexer>();
        var loggerMock = new Mock<ILogger<RedisCacheService>>();
        var settings = Options.Create(new CacheSettings
        {
            InstancePrefix = "test:",
            DefaultTtlMinutes = defaultTtlMinutes
        });

        return new RedisCacheService(
            cacheMock.Object,
            redisMock.Object,
            settings,
            loggerMock.Object);
    }

    /// <summary>
    /// **Validates: Requirements 3.1, 4.1, 5.1**
    /// Property 2: Cache-aside returns data from cache when available (cache hit).
    /// For any string value already in the cache, GetOrSetAsync should return that value
    /// WITHOUT calling the factory function.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property CacheHit_Returns_Cached_Value_Without_Calling_Factory()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            (key, cachedValue) =>
            {
                // Arrange
                var cacheMock = new Mock<IDistributedCache>();
                var serializedBytes = JsonSerializer.SerializeToUtf8Bytes(cachedValue.Get, JsonOptions);

                cacheMock
                    .Setup(c => c.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync(serializedBytes);

                var service = CreateService(cacheMock);
                var factoryCalled = false;

                // Act
                var result = service.GetOrSetAsync<string>(
                    key.Get,
                    () =>
                    {
                        factoryCalled = true;
                        return Task.FromResult("factory-value");
                    }).GetAwaiter().GetResult();

                // Assert
                result.Should().Be(cachedValue.Get);
                factoryCalled.Should().BeFalse("factory should not be called on cache hit");
            });
    }

    /// <summary>
    /// **Validates: Requirements 3.2, 4.2, 5.2**
    /// Property 3: Cache miss populates the cache with correct TTL.
    /// For any value where cache returns null, GetOrSetAsync should call the factory,
    /// store the result via SetAsync with the correct TTL, and return the factory result.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property CacheMiss_Calls_Factory_And_Stores_With_Default_Ttl()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            Arb.Default.PositiveInt().Filter(i => i.Get > 0 && i.Get <= 1440),
            (key, factoryValue, ttlMinutes) =>
            {
                // Arrange
                var cacheMock = new Mock<IDistributedCache>();
                var defaultTtl = ttlMinutes.Get;

                cacheMock
                    .Setup(c => c.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync((byte[]?)null);

                cacheMock
                    .Setup(c => c.SetAsync(
                        It.IsAny<string>(),
                        It.IsAny<byte[]>(),
                        It.IsAny<DistributedCacheEntryOptions>(),
                        It.IsAny<CancellationToken>()))
                    .Returns(Task.CompletedTask);

                var service = CreateService(cacheMock, defaultTtl);

                // Act
                var result = service.GetOrSetAsync<string>(
                    key.Get,
                    () => Task.FromResult(factoryValue.Get)).GetAwaiter().GetResult();

                // Assert
                result.Should().Be(factoryValue.Get);

                cacheMock.Verify(
                    c => c.SetAsync(
                        $"test:{key.Get}",
                        It.Is<byte[]>(b => JsonSerializer.Deserialize<string>(b, JsonOptions) == factoryValue.Get),
                        It.Is<DistributedCacheEntryOptions>(o =>
                            o.AbsoluteExpirationRelativeToNow == TimeSpan.FromMinutes(defaultTtl)),
                        It.IsAny<CancellationToken>()),
                    Times.Once);
            });
    }

    /// <summary>
    /// **Validates: Requirements 3.2, 4.2, 5.2**
    /// Property 3: Cache miss with explicit TTL override stores with the overridden TTL.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property CacheMiss_With_Explicit_Ttl_Stores_With_Overridden_Ttl()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            Arb.Default.PositiveInt().Filter(i => i.Get > 0 && i.Get <= 1440),
            (key, factoryValue, overrideTtlMinutes) =>
            {
                // Arrange
                var cacheMock = new Mock<IDistributedCache>();
                var overrideTtl = TimeSpan.FromMinutes(overrideTtlMinutes.Get);

                cacheMock
                    .Setup(c => c.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync((byte[]?)null);

                cacheMock
                    .Setup(c => c.SetAsync(
                        It.IsAny<string>(),
                        It.IsAny<byte[]>(),
                        It.IsAny<DistributedCacheEntryOptions>(),
                        It.IsAny<CancellationToken>()))
                    .Returns(Task.CompletedTask);

                var service = CreateService(cacheMock);

                // Act
                var result = service.GetOrSetAsync<string>(
                    key.Get,
                    () => Task.FromResult(factoryValue.Get),
                    ttl: overrideTtl).GetAwaiter().GetResult();

                // Assert
                result.Should().Be(factoryValue.Get);

                cacheMock.Verify(
                    c => c.SetAsync(
                        $"test:{key.Get}",
                        It.IsAny<byte[]>(),
                        It.Is<DistributedCacheEntryOptions>(o =>
                            o.AbsoluteExpirationRelativeToNow == overrideTtl),
                        It.IsAny<CancellationToken>()),
                    Times.Once);
            });
    }
}
