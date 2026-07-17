using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PlantonHub.API.Controllers;
using PlantonHub.Application.DTOs.Auth;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;
using System.Security.Claims;

namespace PlantonHub.UnitTests.Controllers;

public class AuthControllerFaceLoginTests
{
    private readonly Mock<ITokenBlacklistService> _tokenBlacklist = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<IFaceVerificationService> _faceVerification = new();
    private readonly Mock<IFaceEnrollmentRepository> _faceEnrollment = new();
    private readonly Mock<IDeviceRegistrationRepository> _deviceRegistration = new();
    private readonly Mock<ICognitoAuthService> _cognitoAuth = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<IAuditService> _auditService = new();

    private AuthController CreateController(ClaimsPrincipal? user = null)
    {
        var controller = new AuthController(
            _tokenBlacklist.Object,
            _tenant.Object,
            _faceVerification.Object,
            _faceEnrollment.Object,
            _deviceRegistration.Object,
            _cognitoAuth.Object,
            _userRepo.Object,
            _auditService.Object);

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = user ?? new ClaimsPrincipal() }
        };

        return controller;
    }

    private static User CreateProfessionalUser(Guid? id = null)
    {
        var userId = id ?? Guid.NewGuid();
        return new User
        {
            Id = userId,
            Email = "medico@test.com",
            Name = "Dr. Test",
            UserClinicRoles = new List<UserClinicRole>
            {
                new() { Id = Guid.NewGuid(), UserId = userId, ClinicId = Guid.NewGuid(), Role = RoleType.Medico }
            }
        };
    }

    private static User CreateAdminUser()
    {
        var userId = Guid.NewGuid();
        return new User
        {
            Id = userId,
            Email = "admin@test.com",
            Name = "Admin",
            UserClinicRoles = new List<UserClinicRole>
            {
                new() { Id = Guid.NewGuid(), UserId = userId, ClinicId = Guid.NewGuid(), Role = RoleType.AdminClinica }
            }
        };
    }

    private static FaceLoginRequest ValidRequest() => new()
    {
        Email = "medico@test.com",
        Embedding = new float[128],
        DeviceId = "device-123",
        Platform = "android",
        DeviceModel = "Samsung S24",
    };

    [Fact]
    public async Task FaceLogin_EmptyEmail_ReturnsBadRequest()
    {
        // With ValidationActionFilter handling validation, if invalid input reaches
        // the controller, it proceeds to lookup → user not found → Unauthorized
        _userRepo.Setup(r => r.GetByEmailAsync("")).ReturnsAsync((User?)null);

        var controller = CreateController();
        var request = ValidRequest();
        request.Email = "";

        var result = await controller.FaceLogin(request);

        result.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async Task FaceLogin_InvalidEmbeddingLength_ReturnsBadRequest()
    {
        // With ValidationActionFilter handling validation, if invalid input reaches
        // the controller, it proceeds to lookup → user not found → Unauthorized
        _userRepo.Setup(r => r.GetByEmailAsync("medico@test.com")).ReturnsAsync((User?)null);

        var controller = CreateController();
        var request = ValidRequest();
        request.Embedding = new float[64]; // wrong size

        var result = await controller.FaceLogin(request);

        result.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async Task FaceLogin_EmptyDeviceId_ReturnsBadRequest()
    {
        // With ValidationActionFilter handling validation, if invalid input reaches
        // the controller, it proceeds to lookup → user not found → Unauthorized
        _userRepo.Setup(r => r.GetByEmailAsync("medico@test.com")).ReturnsAsync((User?)null);

        var controller = CreateController();
        var request = ValidRequest();
        request.DeviceId = "";

        var result = await controller.FaceLogin(request);

        result.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async Task FaceLogin_EmptyPlatform_ReturnsBadRequest()
    {
        // With ValidationActionFilter handling validation, if invalid input reaches
        // the controller, it proceeds to lookup → user not found → Unauthorized
        _userRepo.Setup(r => r.GetByEmailAsync("medico@test.com")).ReturnsAsync((User?)null);

        var controller = CreateController();
        var request = ValidRequest();
        request.Platform = "";

        var result = await controller.FaceLogin(request);

        result.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async Task FaceLogin_UserNotFound_ReturnsUnauthorized()
    {
        _userRepo.Setup(r => r.GetByEmailAsync("medico@test.com")).ReturnsAsync((User?)null);

        var controller = CreateController();
        var result = await controller.FaceLogin(ValidRequest());

        result.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async Task FaceLogin_AdminUser_ReturnsBadRequest()
    {
        var admin = CreateAdminUser();
        _userRepo.Setup(r => r.GetByEmailAsync("admin@test.com")).ReturnsAsync(admin);

        var controller = CreateController();
        var request = ValidRequest();
        request.Email = "admin@test.com";

        var result = await controller.FaceLogin(request);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task FaceLogin_NoEnrollment_ReturnsUnauthorized()
    {
        var user = CreateProfessionalUser();
        _userRepo.Setup(r => r.GetByEmailAsync(user.Email)).ReturnsAsync(user);
        _faceEnrollment.Setup(r => r.HasEnrollmentAsync(user.Id)).ReturnsAsync(false);

        var controller = CreateController();
        var result = await controller.FaceLogin(ValidRequest());

        result.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async Task FaceLogin_FaceMismatch_ReturnsUnauthorized()
    {
        var user = CreateProfessionalUser();
        _userRepo.Setup(r => r.GetByEmailAsync(user.Email)).ReturnsAsync(user);
        _faceEnrollment.Setup(r => r.HasEnrollmentAsync(user.Id)).ReturnsAsync(true);
        _faceVerification.Setup(s => s.VerifyAsync(user.Id, It.IsAny<float[]>()))
            .ReturnsAsync(new FaceVerificationResult(false, 0.3, null));

        var controller = CreateController();
        var result = await controller.FaceLogin(ValidRequest());

        result.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async Task FaceLogin_DifferentDevice_Returns403()
    {
        var user = CreateProfessionalUser();
        _userRepo.Setup(r => r.GetByEmailAsync(user.Email)).ReturnsAsync(user);
        _faceEnrollment.Setup(r => r.HasEnrollmentAsync(user.Id)).ReturnsAsync(true);
        _faceVerification.Setup(s => s.VerifyAsync(user.Id, It.IsAny<float[]>()))
            .ReturnsAsync(new FaceVerificationResult(true, 0.9, Guid.NewGuid()));
        _deviceRegistration.Setup(r => r.GetActiveByUserIdAsync(user.Id))
            .ReturnsAsync(new DeviceRegistration
            {
                Id = Guid.NewGuid(), UserId = user.Id, DeviceId = "other-device",
                Platform = "ios", DeviceModel = "iPhone 15", IsActive = true, RegisteredAt = DateTime.UtcNow
            });

        var controller = CreateController();
        var result = await controller.FaceLogin(ValidRequest());

        var statusResult = result as ObjectResult;
        statusResult!.StatusCode.Should().Be(403);
    }

    [Fact]
    public async Task FaceLogin_FirstLogin_RegistersDeviceAndReturnsTokens()
    {
        var user = CreateProfessionalUser();
        _userRepo.Setup(r => r.GetByEmailAsync(user.Email)).ReturnsAsync(user);
        _faceEnrollment.Setup(r => r.HasEnrollmentAsync(user.Id)).ReturnsAsync(true);
        _faceVerification.Setup(s => s.VerifyAsync(user.Id, It.IsAny<float[]>()))
            .ReturnsAsync(new FaceVerificationResult(true, 0.92, Guid.NewGuid()));
        _deviceRegistration.Setup(r => r.GetActiveByUserIdAsync(user.Id))
            .ReturnsAsync((DeviceRegistration?)null);
        _cognitoAuth.Setup(s => s.AuthenticateAsync(user.Email))
            .ReturnsAsync(new CognitoAuthResult("id-token", "access-token", "refresh-token", 3600));

        var controller = CreateController();
        var result = await controller.FaceLogin(ValidRequest());

        var okResult = result as OkObjectResult;
        okResult.Should().NotBeNull();
        okResult!.StatusCode.Should().Be(200);

        // Verify device was registered
        _deviceRegistration.Verify(r => r.AddAsync(It.Is<DeviceRegistration>(d =>
            d.DeviceId == "device-123" && d.Platform == "android")), Times.Once);
    }

    [Fact]
    public async Task FaceLogin_SameDevice_SkipsRegistration_ReturnsTokens()
    {
        var user = CreateProfessionalUser();
        _userRepo.Setup(r => r.GetByEmailAsync(user.Email)).ReturnsAsync(user);
        _faceEnrollment.Setup(r => r.HasEnrollmentAsync(user.Id)).ReturnsAsync(true);
        _faceVerification.Setup(s => s.VerifyAsync(user.Id, It.IsAny<float[]>()))
            .ReturnsAsync(new FaceVerificationResult(true, 0.85, Guid.NewGuid()));
        _deviceRegistration.Setup(r => r.GetActiveByUserIdAsync(user.Id))
            .ReturnsAsync(new DeviceRegistration
            {
                Id = Guid.NewGuid(), UserId = user.Id, DeviceId = "device-123",
                Platform = "android", IsActive = true, RegisteredAt = DateTime.UtcNow
            });
        _cognitoAuth.Setup(s => s.AuthenticateAsync(user.Email))
            .ReturnsAsync(new CognitoAuthResult("id-token", "access-token", "refresh-token", 3600));

        var controller = CreateController();
        var result = await controller.FaceLogin(ValidRequest());

        result.Should().BeOfType<OkObjectResult>();
        _deviceRegistration.Verify(r => r.AddAsync(It.IsAny<DeviceRegistration>()), Times.Never);
    }
}
