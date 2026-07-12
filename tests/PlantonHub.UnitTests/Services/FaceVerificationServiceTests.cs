using FluentAssertions;
using Microsoft.Extensions.Options;
using Moq;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

public class FaceVerificationServiceTests
{
    private readonly Mock<IFaceEnrollmentRepository> _repoMock = new();
    private readonly IOptions<AntiFraudSettings> _settings;

    public FaceVerificationServiceTests()
    {
        _settings = Options.Create(new AntiFraudSettings { FaceMatchThreshold = 0.6 });
    }

    private FaceVerificationService CreateService() =>
        new(_repoMock.Object, _settings);

    [Fact]
    public void CosineSimilarity_IdenticalVectors_Returns1()
    {
        var vector = Enumerable.Range(0, 128).Select(i => (float)i / 128).ToArray();

        var result = FaceVerificationService.CosineSimilarity(vector, vector);

        result.Should().BeApproximately(1.0, 0.0001);
    }

    [Fact]
    public void CosineSimilarity_OrthogonalVectors_Returns0()
    {
        var a = new float[128];
        var b = new float[128];
        a[0] = 1;
        b[1] = 1;

        var result = FaceVerificationService.CosineSimilarity(a, b);

        result.Should().BeApproximately(0.0, 0.0001);
    }

    [Fact]
    public void CosineSimilarity_OppositeVectors_ReturnsNegative1()
    {
        var a = Enumerable.Range(0, 128).Select(i => 1f).ToArray();
        var b = Enumerable.Range(0, 128).Select(i => -1f).ToArray();

        var result = FaceVerificationService.CosineSimilarity(a, b);

        result.Should().BeApproximately(-1.0, 0.0001);
    }

    [Fact]
    public void CosineSimilarity_EmptyVectors_Returns0()
    {
        var result = FaceVerificationService.CosineSimilarity(Array.Empty<float>(), Array.Empty<float>());

        result.Should().Be(0);
    }

    [Fact]
    public void CosineSimilarity_DifferentLengths_Returns0()
    {
        var a = new float[] { 1, 2, 3 };
        var b = new float[] { 1, 2 };

        var result = FaceVerificationService.CosineSimilarity(a, b);

        result.Should().Be(0);
    }

    [Fact]
    public async Task VerifyAsync_NoEnrollments_ReturnsNoMatch()
    {
        var userId = Guid.NewGuid();
        _repoMock.Setup(r => r.GetActiveByUserIdAsync(userId))
            .ReturnsAsync(Enumerable.Empty<FaceEnrollment>());

        var service = CreateService();
        var probe = new float[128];

        var result = await service.VerifyAsync(userId, probe);

        result.IsMatch.Should().BeFalse();
        result.Confidence.Should().Be(0);
    }

    [Fact]
    public async Task VerifyAsync_MatchingEmbedding_ReturnsMatch()
    {
        var userId = Guid.NewGuid();
        var embedding = Enumerable.Range(0, 128).Select(i => (float)i / 128).ToArray();
        var enrollment = new FaceEnrollment
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Embedding = embedding,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        _repoMock.Setup(r => r.GetActiveByUserIdAsync(userId))
            .ReturnsAsync(new[] { enrollment });

        var service = CreateService();

        // Same embedding = cosine similarity 1.0 (above 0.6 threshold)
        var result = await service.VerifyAsync(userId, embedding);

        result.IsMatch.Should().BeTrue();
        result.Confidence.Should().BeApproximately(1.0, 0.0001);
        result.MatchedEnrollmentId.Should().Be(enrollment.Id);
    }

    [Fact]
    public async Task VerifyAsync_DifferentEmbedding_BelowThreshold_ReturnsNoMatch()
    {
        var userId = Guid.NewGuid();
        var enrolled = Enumerable.Range(0, 128).Select(i => (float)i / 128).ToArray();
        var probe = Enumerable.Range(0, 128).Select(i => (float)(128 - i) / 128).ToArray(); // very different

        var enrollment = new FaceEnrollment
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Embedding = enrolled,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        _repoMock.Setup(r => r.GetActiveByUserIdAsync(userId))
            .ReturnsAsync(new[] { enrollment });

        var service = CreateService();
        var result = await service.VerifyAsync(userId, probe);

        // These vectors have low similarity
        result.Confidence.Should().BeLessThan(0.6);
        result.IsMatch.Should().BeFalse();
        result.MatchedEnrollmentId.Should().BeNull();
    }

    [Fact]
    public async Task VerifyAsync_EmptyProbe_ReturnsNoMatch()
    {
        var service = CreateService();

        var result = await service.VerifyAsync(Guid.NewGuid(), Array.Empty<float>());

        result.IsMatch.Should().BeFalse();
    }
}
