using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PlantonHub.API.Controllers;
using PlantonHub.Application.DTOs.Biometric;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Controllers;

public class BiometricControllerTests
{
    private readonly Mock<IFaceEnrollmentRepository> _enrollmentRepo = new();
    private readonly Mock<IFaceVerificationService> _verificationService = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<IBiometricProofService> _biometricProof = new();

    private BiometricController CreateController()
    {
        var controller = new BiometricController(
            _enrollmentRepo.Object,
            _verificationService.Object,
            _tenant.Object,
            _biometricProof.Object);

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        return controller;
    }

    private static float[] ValidEmbedding() => new float[128];

    // --- Enroll (Admin) ---

    [Fact]
    public async Task Enroll_EmptyEmbedding_ReturnsBadRequest()
    {
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = Array.Empty<float>() };

        var result = await controller.Enroll(Guid.NewGuid(), request);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Enroll_WrongDimension_ReturnsBadRequest()
    {
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = new float[64] };

        var result = await controller.Enroll(Guid.NewGuid(), request);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Enroll_TargetUserOutsideTenantScope_ReturnsForbid()
    {
        var targetUserId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(targetUserId)).ReturnsAsync(false);
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = ValidEmbedding() };

        var result = await controller.Enroll(targetUserId, request);

        result.Should().BeOfType<ForbidResult>();
        _enrollmentRepo.Verify(r => r.AddAsync(It.IsAny<FaceEnrollment>()), Times.Never);
    }

    [Fact]
    public async Task Enroll_Valid_ReturnsCreated()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(true);
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = ValidEmbedding() };

        var result = await controller.Enroll(userId, request);

        var created = result as CreatedResult;
        created.Should().NotBeNull();
        created!.StatusCode.Should().Be(201);

        _enrollmentRepo.Verify(r => r.AddAsync(It.Is<FaceEnrollment>(e =>
            e.UserId == userId && e.Embedding.Length == 128 && e.IsActive)), Times.Once);
    }

    // --- Enroll Self ---

    [Fact]
    public async Task EnrollSelf_NoUser_ReturnsUnauthorized()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = ValidEmbedding() };

        var result = await controller.EnrollSelf(request);

        result.Should().BeOfType<UnauthorizedResult>();
    }

    [Fact]
    public async Task EnrollSelf_WrongDimension_ReturnsBadRequest()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(Guid.NewGuid());
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = new float[64] };

        var result = await controller.EnrollSelf(request);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task EnrollSelf_Valid_ReturnsCreated()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = ValidEmbedding() };

        var result = await controller.EnrollSelf(request);

        result.Should().BeOfType<CreatedResult>();
        _enrollmentRepo.Verify(r => r.AddAsync(It.Is<FaceEnrollment>(e => e.UserId == userId)), Times.Once);
    }

    // --- Verify ---

    [Fact]
    public async Task Verify_NoUser_ReturnsUnauthorized()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);
        var controller = CreateController();

        var result = await controller.Verify(new FaceVerifyRequest { Embedding = ValidEmbedding() });

        result.Should().BeOfType<UnauthorizedResult>();
    }

    [Fact]
    public async Task Verify_WrongDimension_ReturnsBadRequest()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(Guid.NewGuid());
        var controller = CreateController();

        var result = await controller.Verify(new FaceVerifyRequest { Embedding = new float[32] });

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Verify_NoEnrollment_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _enrollmentRepo.Setup(r => r.HasEnrollmentAsync(userId)).ReturnsAsync(false);
        var controller = CreateController();

        var result = await controller.Verify(new FaceVerifyRequest { Embedding = ValidEmbedding() });

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task Verify_Match_ReturnsOkWithConfidence()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _enrollmentRepo.Setup(r => r.HasEnrollmentAsync(userId)).ReturnsAsync(true);
        _verificationService.Setup(s => s.VerifyAsync(userId, It.IsAny<float[]>()))
            .ReturnsAsync(new FaceVerificationResult(true, 0.88, Guid.NewGuid()));
        var controller = CreateController();

        var result = await controller.Verify(new FaceVerifyRequest { Embedding = ValidEmbedding() });

        var okResult = result as OkObjectResult;
        okResult.Should().NotBeNull();
    }

    // --- Status ---

    [Fact]
    public async Task GetStatus_NoUser_ReturnsUnauthorized()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);
        var controller = CreateController();

        var result = await controller.GetStatus();

        result.Should().BeOfType<UnauthorizedResult>();
    }

    [Fact]
    public async Task GetStatus_HasEnrollment_ReturnsTrue()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _enrollmentRepo.Setup(r => r.HasEnrollmentAsync(userId)).ReturnsAsync(true);
        var controller = CreateController();

        var result = await controller.GetStatus();

        result.Should().BeOfType<OkObjectResult>();
    }

    // --- Delete Own Enrollment ---

    [Fact]
    public async Task DeleteOwnEnrollment_NoUser_ReturnsUnauthorized()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);
        var controller = CreateController();

        var result = await controller.DeleteOwnEnrollment();

        result.Should().BeOfType<UnauthorizedResult>();
    }

    [Fact]
    public async Task DeleteOwnEnrollment_Success_DeactivatesAll()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        var controller = CreateController();

        var result = await controller.DeleteOwnEnrollment();

        result.Should().BeOfType<NoContentResult>();
        _enrollmentRepo.Verify(r => r.DeactivateAllForUserAsync(userId), Times.Once);
    }

    // --- Re-enroll (Admin) ---

    [Fact]
    public async Task ReEnroll_WrongDimension_ReturnsBadRequest()
    {
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = new float[64] };

        var result = await controller.ReEnroll(Guid.NewGuid(), request);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task ReEnroll_TargetUserOutsideTenantScope_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(false);
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = ValidEmbedding() };

        var result = await controller.ReEnroll(userId, request);

        result.Should().BeOfType<ForbidResult>();
        _enrollmentRepo.Verify(r => r.DeactivateAllForUserAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task ReEnroll_Valid_DeactivatesOldAndCreatesNew()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(true);
        var controller = CreateController();
        var request = new FaceEnrollmentRequest { Embedding = ValidEmbedding() };

        var result = await controller.ReEnroll(userId, request);

        result.Should().BeOfType<CreatedResult>();
        _enrollmentRepo.Verify(r => r.DeactivateAllForUserAsync(userId), Times.Once);
        _enrollmentRepo.Verify(r => r.AddAsync(It.Is<FaceEnrollment>(e =>
            e.UserId == userId && e.IsActive)), Times.Once);
    }

    // --- Get Enrollments (Admin) ---

    [Fact]
    public async Task GetEnrollments_TargetUserOutsideTenantScope_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(false);
        var controller = CreateController();

        var result = await controller.GetEnrollments(userId);

        result.Should().BeOfType<ForbidResult>();
        _enrollmentRepo.Verify(r => r.GetAllByUserIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task GetEnrollments_ReturnsAll()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(true);
        _enrollmentRepo.Setup(r => r.GetAllByUserIdAsync(userId))
            .ReturnsAsync(new[]
            {
                new FaceEnrollment { Id = Guid.NewGuid(), UserId = userId, IsActive = true, CreatedAt = DateTime.UtcNow, Embedding = new float[128] },
                new FaceEnrollment { Id = Guid.NewGuid(), UserId = userId, IsActive = false, CreatedAt = DateTime.UtcNow.AddDays(-30), Embedding = new float[128] },
            });
        var controller = CreateController();

        var result = await controller.GetEnrollments(userId);

        var okResult = result as OkObjectResult;
        okResult.Should().NotBeNull();
    }
}
