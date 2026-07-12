using FluentAssertions;
using Moq;
using PlantonHub.Application.Interfaces;
using PlantonHub.Infrastructure.Services;

namespace PlantonHub.UnitTests.Services;

public class BiometricProofServiceTests
{
    private readonly Mock<ICacheService> _cache = new();
    private readonly RedisBiometricProofService _service;

    public BiometricProofServiceTests()
    {
        _service = new RedisBiometricProofService(_cache.Object);
    }

    [Fact]
    public async Task IssueTokenAsync_ReturnsNonEmptyToken()
    {
        var userId = Guid.NewGuid();

        var token = await _service.IssueTokenAsync(userId);

        token.Should().NotBeNullOrWhiteSpace();
        token.Length.Should().BeGreaterThan(20); // Base64 of 32 bytes
    }

    [Fact]
    public async Task IssueTokenAsync_StoresInCacheWithCorrectKey()
    {
        var userId = Guid.NewGuid();

        await _service.IssueTokenAsync(userId);

        _cache.Verify(c => c.SetAsync(
            $"biometric-proof:{userId}",
            It.IsAny<string>(),
            TimeSpan.FromMinutes(5),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task IssueTokenAsync_GeneratesUniqueTokensEachCall()
    {
        var userId = Guid.NewGuid();

        var token1 = await _service.IssueTokenAsync(userId);
        var token2 = await _service.IssueTokenAsync(userId);

        token1.Should().NotBe(token2);
    }

    [Fact]
    public async Task ValidateAndConsumeAsync_ValidToken_ReturnsTrueAndRemovesFromCache()
    {
        var userId = Guid.NewGuid();
        var token = "valid-token-123";
        var key = $"biometric-proof:{userId}";

        _cache.Setup(c => c.GetAsync<string>(key, It.IsAny<CancellationToken>()))
            .ReturnsAsync(token);

        var result = await _service.ValidateAndConsumeAsync(userId, token);

        result.Should().BeTrue();
        _cache.Verify(c => c.RemoveAsync(key, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ValidateAndConsumeAsync_TokenNotInCache_ReturnsFalse()
    {
        var userId = Guid.NewGuid();

        _cache.Setup(c => c.GetAsync<string>(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);

        var result = await _service.ValidateAndConsumeAsync(userId, "any-token");

        result.Should().BeFalse();
        _cache.Verify(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ValidateAndConsumeAsync_WrongToken_ReturnsFalse()
    {
        var userId = Guid.NewGuid();
        var key = $"biometric-proof:{userId}";

        _cache.Setup(c => c.GetAsync<string>(key, It.IsAny<CancellationToken>()))
            .ReturnsAsync("correct-token");

        var result = await _service.ValidateAndConsumeAsync(userId, "wrong-token");

        result.Should().BeFalse();
        _cache.Verify(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ValidateAndConsumeAsync_EmptyToken_ReturnsFalse()
    {
        var userId = Guid.NewGuid();

        var result = await _service.ValidateAndConsumeAsync(userId, "");

        result.Should().BeFalse();
        _cache.Verify(c => c.GetAsync<string>(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ValidateAndConsumeAsync_NullToken_ReturnsFalse()
    {
        var userId = Guid.NewGuid();

        var result = await _service.ValidateAndConsumeAsync(userId, null!);

        result.Should().BeFalse();
    }
}
