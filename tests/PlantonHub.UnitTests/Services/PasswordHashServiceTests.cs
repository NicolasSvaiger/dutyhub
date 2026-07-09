using FluentAssertions;
using PlantonHub.Infrastructure.Services;

namespace PlantonHub.UnitTests.Services;

public class PasswordHashServiceTests
{
    private readonly PasswordHashService _service = new();

    [Fact]
    public void HashPassword_ShouldReturnNonEmptyHash()
    {
        var hash = _service.HashPassword("TestPassword123");

        hash.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void HashPassword_ShouldReturnDifferentHashForSamePassword()
    {
        var hash1 = _service.HashPassword("TestPassword123");
        var hash2 = _service.HashPassword("TestPassword123");

        // BCrypt generates different hashes due to random salt
        hash1.Should().NotBe(hash2);
    }

    [Fact]
    public void VerifyPassword_WithCorrectPassword_ShouldReturnTrue()
    {
        var password = "MySecurePassword!";
        var hash = _service.HashPassword(password);

        var result = _service.VerifyPassword(password, hash);

        result.Should().BeTrue();
    }

    [Fact]
    public void VerifyPassword_WithIncorrectPassword_ShouldReturnFalse()
    {
        var hash = _service.HashPassword("CorrectPassword");

        var result = _service.VerifyPassword("WrongPassword", hash);

        result.Should().BeFalse();
    }

    [Fact]
    public void HashPassword_ShouldProduceBCryptFormat()
    {
        var hash = _service.HashPassword("TestPassword");

        // BCrypt hashes start with $2a$, $2b$, or $2y$
        hash.Should().StartWith("$2");
    }
}
