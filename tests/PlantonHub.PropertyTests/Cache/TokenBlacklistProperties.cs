using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using PlantonHub.Infrastructure.Cache;

namespace PlantonHub.PropertyTests.Cache;

/// <summary>
/// Property-based tests for token blacklist with correct TTL on logout.
/// Validates: Requirements 7.1, 7.4, 7.5
/// </summary>
[Trait("Feature", "redis-cache-layer")]
[Collection("CacheKeys")] // Disable parallelism for tests that share static CacheKeys state
public class TokenBlacklistProperties
{
    private static RedisTokenBlacklistService CreateService(
        Mock<IDistributedCache> cacheMock)
    {
        var loggerMock = new Mock<ILogger<RedisTokenBlacklistService>>();
        var settings = Options.Create(new CacheSettings
        {
            InstancePrefix = "test:",
            DefaultTtlMinutes = 5
        });

        return new RedisTokenBlacklistService(
            cacheMock.Object,
            settings,
            loggerMock.Object);
    }

    /// <summary>
    /// **Validates: Requirements 7.1, 7.4, 7.5**
    /// Property 7: Token blacklist stores token with TTL equal to remainingTtl.
    /// For any valid JTI string and any positive TimeSpan representing remaining TTL,
    /// BlacklistTokenAsync should call SetAsync with the correct prefixed key
    /// and AbsoluteExpirationRelativeToNow equal to remainingTtl.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property BlacklistTokenAsync_Stores_With_Correct_Key_And_Ttl()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            Arb.Default.PositiveInt().Filter(i => i.Get > 0 && i.Get <= 1440),
            (jti, ttlMinutes) =>
            {
                // Arrange
                CacheKeys.SetPrefix("plantonhub");
                var cacheMock = new Mock<IDistributedCache>();
                var remainingTtl = TimeSpan.FromMinutes(ttlMinutes.Get);
                string? capturedKey = null;
                DistributedCacheEntryOptions? capturedOptions = null;

                cacheMock
                    .Setup(c => c.SetAsync(
                        It.IsAny<string>(),
                        It.IsAny<byte[]>(),
                        It.IsAny<DistributedCacheEntryOptions>(),
                        It.IsAny<CancellationToken>()))
                    .Callback<string, byte[], DistributedCacheEntryOptions, CancellationToken>(
                        (key, _, options, _) => { capturedKey = key; capturedOptions = options; })
                    .Returns(Task.CompletedTask);

                var service = CreateService(cacheMock);

                // Act
                service.BlacklistTokenAsync(jti.Get, remainingTtl)
                    .GetAwaiter().GetResult();

                // Assert
                capturedKey.Should().NotBeNullOrEmpty();
                capturedKey.Should().StartWith("test:");
                capturedKey.Should().EndWith($":blacklist:{jti.Get}");
                capturedOptions!.AbsoluteExpirationRelativeToNow.Should().Be(remainingTtl);
            });
    }

    /// <summary>
    /// **Validates: Requirements 7.1, 7.4**
    /// Property 7: After blacklisting, IsBlacklistedAsync returns true for that JTI.
    /// For any valid JTI string, when GetAsync returns non-null bytes,
    /// IsBlacklistedAsync should return true.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property IsBlacklistedAsync_Returns_True_When_Token_Exists_In_Cache()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            jti =>
            {
                // Arrange
                CacheKeys.SetPrefix("plantonhub");
                var cacheMock = new Mock<IDistributedCache>();
                // Use It.IsAny to avoid race condition with shared static prefix
                cacheMock
                    .Setup(c => c.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync(new byte[] { 1 });

                var service = CreateService(cacheMock);

                // Act
                var result = service.IsBlacklistedAsync(jti.Get)
                    .GetAwaiter().GetResult();

                // Assert
                result.Should().BeTrue("token exists in blacklist cache");
            });
    }

    /// <summary>
    /// **Validates: Requirements 7.5**
    /// Property 7: IsBlacklistedAsync returns false when token is not in cache.
    /// For any valid JTI string, when GetAsync returns null,
    /// IsBlacklistedAsync should return false (token not blacklisted or expired).
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property IsBlacklistedAsync_Returns_False_When_Token_Not_In_Cache()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            jti =>
            {
                // Arrange
                CacheKeys.SetPrefix("plantonhub");
                var cacheMock = new Mock<IDistributedCache>();
                // Use It.IsAny to avoid race condition with shared static prefix
                cacheMock
                    .Setup(c => c.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync((byte[]?)null);

                var service = CreateService(cacheMock);

                // Act
                var result = service.IsBlacklistedAsync(jti.Get)
                    .GetAwaiter().GetResult();

                // Assert
                result.Should().BeFalse("token does not exist in blacklist cache (expired or never blacklisted)");
            });
    }

    /// <summary>
    /// **Validates: Requirements 7.4, 7.5**
    /// Property 7: The stored key follows the CacheKeys.TokenBlacklist pattern with InstancePrefix.
    /// For any valid JTI string, the key used in cache operations should match
    /// the pattern "test:" + CacheKeys.TokenBlacklist(jti).
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property BlacklistTokenAsync_Uses_Correct_Key_Pattern()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            jti =>
            {
                // Arrange
                CacheKeys.SetPrefix("plantonhub");
                var cacheMock = new Mock<IDistributedCache>();
                var remainingTtl = TimeSpan.FromMinutes(30);
                string? capturedKey = null;

                cacheMock
                    .Setup(c => c.SetAsync(
                        It.IsAny<string>(),
                        It.IsAny<byte[]>(),
                        It.IsAny<DistributedCacheEntryOptions>(),
                        It.IsAny<CancellationToken>()))
                    .Callback<string, byte[], DistributedCacheEntryOptions, CancellationToken>(
                        (key, _, _, _) => capturedKey = key)
                    .Returns(Task.CompletedTask);

                var service = CreateService(cacheMock);

                // Act
                service.BlacklistTokenAsync(jti.Get, remainingTtl)
                    .GetAwaiter().GetResult();

                // Assert - verify key follows expected pattern: InstancePrefix + prefix:blacklist:jti
                capturedKey.Should().NotBeNullOrEmpty();
                capturedKey.Should().StartWith("test:");
                capturedKey.Should().EndWith($":blacklist:{jti.Get}");
            });
    }
}
