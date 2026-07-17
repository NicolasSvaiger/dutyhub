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

public class AuthControllerDeviceTests
{
    private readonly Mock<ITokenBlacklistService> _tokenBlacklist = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<IFaceVerificationService> _faceVerification = new();
    private readonly Mock<IFaceEnrollmentRepository> _faceEnrollment = new();
    private readonly Mock<IDeviceRegistrationRepository> _deviceRegistration = new();
    private readonly Mock<ICognitoAuthService> _cognitoAuth = new();
    private readonly Mock<IUserRepository> _userRepo = new();

    private AuthController CreateController(ClaimsPrincipal? user = null)
    {
        var controller = new AuthController(
            _tokenBlacklist.Object,
            _tenant.Object,
            _faceVerification.Object,
            _faceEnrollment.Object,
            _deviceRegistration.Object,
            _cognitoAuth.Object,
            _userRepo.Object);

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = user ?? new ClaimsPrincipal() }
        };

        return controller;
    }

    // --- Reset Device Self ---

    [Fact]
    public async Task ResetDeviceSelf_EmptyReason_ReturnsBadRequest()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(Guid.NewGuid());
        var controller = CreateController();

        var result = await controller.ResetDeviceSelf(new ResetDeviceRequest { Reason = "" });

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task ResetDeviceSelf_NoUser_ReturnsUnauthorized()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);
        var controller = CreateController();

        var result = await controller.ResetDeviceSelf(new ResetDeviceRequest { Reason = "Troca" });

        result.Should().BeOfType<UnauthorizedResult>();
    }

    [Fact]
    public async Task ResetDeviceSelf_NoActiveDevice_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _deviceRegistration.Setup(r => r.GetActiveByUserIdAsync(userId)).ReturnsAsync((DeviceRegistration?)null);

        var controller = CreateController();
        var result = await controller.ResetDeviceSelf(new ResetDeviceRequest { Reason = "Troca de celular" });

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task ResetDeviceSelf_Success_DeactivatesAndAudits()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _deviceRegistration.Setup(r => r.GetActiveByUserIdAsync(userId))
            .ReturnsAsync(new DeviceRegistration
            {
                Id = Guid.NewGuid(), UserId = userId, DeviceId = "old-device",
                Platform = "android", DeviceModel = "Samsung S23", IsActive = true, RegisteredAt = DateTime.UtcNow
            });

        var controller = CreateController();
        var result = await controller.ResetDeviceSelf(new ResetDeviceRequest { Reason = "Troca de celular" });

        result.Should().BeOfType<NoContentResult>();
        _deviceRegistration.Verify(r => r.DeactivateAllForUserAsync(userId), Times.Once);
        _deviceRegistration.Verify(r => r.AddUnlinkAuditAsync(It.Is<DeviceUnlinkAudit>(a =>
            a.UserId == userId &&
            a.OldDeviceId == "old-device" &&
            a.UnlinkedBy == "self" &&
            a.Reason == "Troca de celular")), Times.Once);
    }

    // --- Reset Device Admin ---

    [Fact]
    public async Task ResetDeviceAdmin_EmptyReason_ReturnsBadRequest()
    {
        var controller = CreateController();
        var result = await controller.ResetDeviceAdmin(Guid.NewGuid(), new ResetDeviceRequest { Reason = "" });

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task ResetDeviceAdmin_TargetUserOutsideTenantScope_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(false);

        var controller = CreateController();
        var result = await controller.ResetDeviceAdmin(userId, new ResetDeviceRequest { Reason = "Roubado" });

        result.Should().BeOfType<ForbidResult>();
        _deviceRegistration.Verify(r => r.DeactivateAllForUserAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task ResetDeviceAdmin_NoActiveDevice_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(true);
        _deviceRegistration.Setup(r => r.GetActiveByUserIdAsync(userId)).ReturnsAsync((DeviceRegistration?)null);

        var controller = CreateController();
        var result = await controller.ResetDeviceAdmin(userId, new ResetDeviceRequest { Reason = "Roubado" });

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task ResetDeviceAdmin_Success_DeactivatesAndAuditsWithAdminId()
    {
        var userId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(true);
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(adminId);
        _deviceRegistration.Setup(r => r.GetActiveByUserIdAsync(userId))
            .ReturnsAsync(new DeviceRegistration
            {
                Id = Guid.NewGuid(), UserId = userId, DeviceId = "stolen-device",
                Platform = "ios", DeviceModel = "iPhone 14", IsActive = true, RegisteredAt = DateTime.UtcNow
            });

        var controller = CreateController();
        var result = await controller.ResetDeviceAdmin(userId, new ResetDeviceRequest { Reason = "Celular roubado" });

        result.Should().BeOfType<NoContentResult>();
        _deviceRegistration.Verify(r => r.AddUnlinkAuditAsync(It.Is<DeviceUnlinkAudit>(a =>
            a.UnlinkedBy == $"admin:{adminId}" &&
            a.OldDeviceId == "stolen-device")), Times.Once);
    }

    // --- Device Audit ---

    [Fact]
    public async Task GetDeviceAudit_TargetUserOutsideTenantScope_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(false);

        var controller = CreateController();
        var result = await controller.GetDeviceAudit(userId);

        result.Should().BeOfType<ForbidResult>();
        _deviceRegistration.Verify(r => r.GetUnlinkHistoryAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task GetDeviceAudit_ReturnsHistory()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(true);
        _deviceRegistration.Setup(r => r.GetUnlinkHistoryAsync(userId))
            .ReturnsAsync(new[]
            {
                new DeviceUnlinkAudit
                {
                    Id = Guid.NewGuid(), UserId = userId, OldDeviceId = "dev-1",
                    Platform = "android", UnlinkedBy = "self", Reason = "Troca", UnlinkedAt = DateTime.UtcNow
                }
            });

        var controller = CreateController();
        var result = await controller.GetDeviceAudit(userId);

        var okResult = result as OkObjectResult;
        okResult.Should().NotBeNull();
    }

    // --- Setup Face Login ---

    [Fact]
    public async Task SetupFaceLogin_TargetUserOutsideTenantScope_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(false);

        var controller = CreateController();
        var result = await controller.SetupFaceLogin(userId);

        result.Should().BeOfType<ForbidResult>();
        _userRepo.Verify(r => r.GetByIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task SetupFaceLogin_UserNotFound_ReturnsNotFound()
    {
        _tenant.Setup(t => t.CanOperateOnUserAsync(It.IsAny<Guid>())).ReturnsAsync(true);
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var controller = CreateController();
        var result = await controller.SetupFaceLogin(Guid.NewGuid());

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task SetupFaceLogin_AdminUser_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var admin = new User
        {
            Id = userId, Email = "admin@test.com", Name = "Admin",
            UserClinicRoles = new List<UserClinicRole>
            {
                new() { Id = Guid.NewGuid(), UserId = userId, ClinicId = Guid.NewGuid(), Role = RoleType.AdminGlobal }
            }
        };
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(true);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(admin);

        var controller = CreateController();
        var result = await controller.SetupFaceLogin(userId);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task SetupFaceLogin_Professional_CallsSetServicePassword()
    {
        var userId = Guid.NewGuid();
        var user = new User
        {
            Id = userId, Email = "medico@test.com", Name = "Dr. Test",
            UserClinicRoles = new List<UserClinicRole>
            {
                new() { Id = Guid.NewGuid(), UserId = userId, ClinicId = Guid.NewGuid(), Role = RoleType.Medico }
            }
        };
        _tenant.Setup(t => t.CanOperateOnUserAsync(userId)).ReturnsAsync(true);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);

        var controller = CreateController();
        var result = await controller.SetupFaceLogin(userId);

        result.Should().BeOfType<NoContentResult>();
        _cognitoAuth.Verify(s => s.EnsureUserExistsAsync("medico@test.com"), Times.Once);
    }
}
