using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Moq;
using PlantonHub.Application.Constants;
using PlantonHub.Application.DTOs.Clinics;
using PlantonHub.Application.DTOs.Shifts;
using PlantonHub.Application.DTOs.Users;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.PropertyTests.Cache;

/// <summary>
/// Property-based tests for cache invalidation on write operations.
/// Property 4: Write operations invalidate related cache entries.
/// **Validates: Requirements 3.3, 4.3, 5.3**
/// </summary>
[Trait("Feature", "redis-cache-layer")]
public class CacheInvalidationProperties
{
    /// <summary>
    /// **Validates: Requirements 3.3**
    /// Property 4: ClinicService.CreateAsync invalidates cache entries with prefix "clinics:".
    /// For any valid clinic creation request, RemoveByPrefixAsync("clinics:") MUST be called.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property ClinicService_CreateAsync_Invalidates_Clinics_Cache()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            (clinicName) =>
            {
                // Arrange
                var clinicRepoMock = new Mock<IClinicRepository>();
                var tenantServiceMock = new Mock<ITenantService>();
                var cacheServiceMock = new Mock<ICacheService>();

                tenantServiceMock.Setup(t => t.IsAdminGlobal()).Returns(true);

                clinicRepoMock
                    .Setup(r => r.AddAsync(It.IsAny<Clinic>()))
                    .Returns(Task.CompletedTask);

                cacheServiceMock
                    .Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .Returns(Task.CompletedTask);

                var service = new ClinicService(
                    clinicRepoMock.Object,
                    tenantServiceMock.Object,
                    cacheServiceMock.Object);

                var request = new CreateClinicRequest
                {
                    Name = clinicName.Get,
                    Address = "Test Address",
                    Phone = "123456"
                };

                // Act
                service.CreateAsync(request).GetAwaiter().GetResult();

                // Assert
                cacheServiceMock.Verify(
                    c => c.RemoveByPrefixAsync("clinics:", It.IsAny<CancellationToken>()),
                    Times.Once,
                    "ClinicService.CreateAsync must call RemoveByPrefixAsync(\"clinics:\") to invalidate cache");
            });
    }

    /// <summary>
    /// **Validates: Requirements 4.3**
    /// Property 4: ShiftService.CreateAsync invalidates cache entries with prefix "shifts:".
    /// For any valid shift creation request, RemoveByPrefixAsync("shifts:") MUST be called.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property ShiftService_CreateAsync_Invalidates_Shifts_Cache()
    {
        return Prop.ForAll(
            Arb.Default.Guid(),
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            (clinicId, shiftTitle) =>
            {
                // Arrange
                var shiftRepoMock = new Mock<IShiftRepository>();
                var userRepoMock = new Mock<IUserRepository>();
                var tenantServiceMock = new Mock<ITenantService>();
                var cacheServiceMock = new Mock<ICacheService>();

                tenantServiceMock.Setup(t => t.IsAdminGlobal()).Returns(true);
                tenantServiceMock.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });

                shiftRepoMock
                    .Setup(r => r.AddAsync(It.IsAny<Shift>()))
                    .Returns(Task.CompletedTask);

                cacheServiceMock
                    .Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .Returns(Task.CompletedTask);

                var service = new ShiftService(
                    shiftRepoMock.Object,
                    userRepoMock.Object,
                    tenantServiceMock.Object,
                    cacheServiceMock.Object);

                var request = new CreateShiftRequest
                {
                    ClinicId = clinicId,
                    Title = shiftTitle.Get,
                    Date = DateTime.UtcNow.Date,
                    StartTime = TimeSpan.FromHours(8),
                    EndTime = TimeSpan.FromHours(16)
                };

                // Act
                service.CreateAsync(request).GetAwaiter().GetResult();

                // Assert
                cacheServiceMock.Verify(
                    c => c.RemoveByPrefixAsync("shifts:", It.IsAny<CancellationToken>()),
                    Times.Once,
                    "ShiftService.CreateAsync must call RemoveByPrefixAsync(\"shifts:\") to invalidate cache");
            });
    }

    /// <summary>
    /// **Validates: Requirements 4.3**
    /// Property 4: ShiftService.AssignProfessionalAsync invalidates cache entries with prefix "shifts:".
    /// For any valid assignment operation, RemoveByPrefixAsync("shifts:") MUST be called.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property ShiftService_AssignProfessionalAsync_Invalidates_Shifts_Cache()
    {
        return Prop.ForAll(
            Arb.Default.Guid(),
            Arb.Default.Guid(),
            Arb.Default.Guid(),
            (shiftId, userId, clinicId) =>
            {
                // Arrange
                var shiftRepoMock = new Mock<IShiftRepository>();
                var userRepoMock = new Mock<IUserRepository>();
                var tenantServiceMock = new Mock<ITenantService>();
                var cacheServiceMock = new Mock<ICacheService>();

                tenantServiceMock.Setup(t => t.IsAdminGlobal()).Returns(true);
                tenantServiceMock.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });

                var shift = new Shift
                {
                    Id = shiftId,
                    ClinicId = clinicId,
                    Title = "Test Shift",
                    Date = DateTime.UtcNow.Date,
                    StartTime = TimeSpan.FromHours(8),
                    EndTime = TimeSpan.FromHours(16),
                    CreatedAt = DateTime.UtcNow
                };

                shiftRepoMock
                    .Setup(r => r.GetByIdAsync(shiftId))
                    .ReturnsAsync(shift);

                var user = new User
                {
                    Id = userId,
                    Name = "Test User",
                    Email = "test@test.com",
                    PasswordHash = "hash",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                userRepoMock
                    .Setup(r => r.GetByIdAsync(userId))
                    .ReturnsAsync(user);

                shiftRepoMock
                    .Setup(r => r.AssignmentExistsAsync(shiftId, userId))
                    .ReturnsAsync(false);

                shiftRepoMock
                    .Setup(r => r.AddAssignmentAsync(It.IsAny<ShiftAssignment>()))
                    .Returns(Task.CompletedTask);

                cacheServiceMock
                    .Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .Returns(Task.CompletedTask);

                var service = new ShiftService(
                    shiftRepoMock.Object,
                    userRepoMock.Object,
                    tenantServiceMock.Object,
                    cacheServiceMock.Object);

                var request = new AssignShiftRequest { UserId = userId };

                // Act
                service.AssignProfessionalAsync(shiftId, request).GetAwaiter().GetResult();

                // Assert
                cacheServiceMock.Verify(
                    c => c.RemoveByPrefixAsync("shifts:", It.IsAny<CancellationToken>()),
                    Times.Once,
                    "ShiftService.AssignProfessionalAsync must call RemoveByPrefixAsync(\"shifts:\") to invalidate cache");
            });
    }

    /// <summary>
    /// **Validates: Requirements 5.3**
    /// Property 4: UserService.CreateAsync invalidates cache entries with prefix "users:".
    /// For any valid user creation request, RemoveByPrefixAsync("users:") MUST be called.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property UserService_CreateAsync_Invalidates_Users_Cache()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get)),
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get) && s.Get.Contains('@') == false),
            (userName, password) =>
            {
                // Arrange
                var userRepoMock = new Mock<IUserRepository>();
                var clinicRepoMock = new Mock<IClinicRepository>();
                var tenantServiceMock = new Mock<ITenantService>();
                var passwordHashMock = new Mock<IPasswordHashService>();
                var cacheServiceMock = new Mock<ICacheService>();

                tenantServiceMock.Setup(t => t.IsAdminGlobal()).Returns(true);

                var email = $"{Guid.NewGuid()}@test.com";

                userRepoMock
                    .Setup(r => r.EmailExistsAsync(email))
                    .ReturnsAsync(false);

                userRepoMock
                    .Setup(r => r.AddAsync(It.IsAny<User>()))
                    .Returns(Task.CompletedTask);

                passwordHashMock
                    .Setup(p => p.HashPassword(It.IsAny<string>()))
                    .Returns("hashed_password");

                cacheServiceMock
                    .Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .Returns(Task.CompletedTask);

                var service = new UserService(
                    userRepoMock.Object,
                    clinicRepoMock.Object,
                    tenantServiceMock.Object,
                    passwordHashMock.Object,
                    cacheServiceMock.Object);

                var request = new CreateUserRequest
                {
                    Name = userName.Get,
                    Email = email,
                    Password = password.Get
                };

                // Act
                service.CreateAsync(request).GetAwaiter().GetResult();

                // Assert
                cacheServiceMock.Verify(
                    c => c.RemoveByPrefixAsync("users:", It.IsAny<CancellationToken>()),
                    Times.Once,
                    "UserService.CreateAsync must call RemoveByPrefixAsync(\"users:\") to invalidate cache");
            });
    }

    /// <summary>
    /// **Validates: Requirements 5.3**
    /// Property 4: UserService.AssignClinicRoleAsync invalidates the specific user profile cache.
    /// For any valid role assignment, RemoveAsync(CacheKeys.UserProfile(userId)) MUST be called.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property UserService_AssignClinicRoleAsync_Invalidates_UserProfile_Cache()
    {
        return Prop.ForAll(
            Arb.Default.Guid(),
            Arb.Default.Guid(),
            (userId, clinicId) =>
            {
                // Arrange
                var userRepoMock = new Mock<IUserRepository>();
                var clinicRepoMock = new Mock<IClinicRepository>();
                var tenantServiceMock = new Mock<ITenantService>();
                var passwordHashMock = new Mock<IPasswordHashService>();
                var cacheServiceMock = new Mock<ICacheService>();

                tenantServiceMock.Setup(t => t.IsAdminGlobal()).Returns(true);

                var user = new User
                {
                    Id = userId,
                    Name = "Test User",
                    Email = "test@test.com",
                    PasswordHash = "hash",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    UserClinicRoles = new List<UserClinicRole>()
                };

                userRepoMock
                    .Setup(r => r.GetByIdAsync(userId))
                    .ReturnsAsync(user);

                var clinic = new Clinic
                {
                    Id = clinicId,
                    Name = "Test Clinic",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                clinicRepoMock
                    .Setup(r => r.GetByIdAsync(clinicId))
                    .ReturnsAsync(clinic);

                userRepoMock
                    .Setup(r => r.UpdateAsync(It.IsAny<User>()))
                    .Returns(Task.CompletedTask);

                cacheServiceMock
                    .Setup(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .Returns(Task.CompletedTask);

                var service = new UserService(
                    userRepoMock.Object,
                    clinicRepoMock.Object,
                    tenantServiceMock.Object,
                    passwordHashMock.Object,
                    cacheServiceMock.Object);

                var request = new AssignRoleRequest
                {
                    ClinicId = clinicId,
                    Role = RoleType.Medico
                };

                // Act
                service.AssignClinicRoleAsync(userId, request).GetAwaiter().GetResult();

                // Assert
                var expectedKey = CacheKeys.UserProfile(userId);
                cacheServiceMock.Verify(
                    c => c.RemoveAsync(expectedKey, It.IsAny<CancellationToken>()),
                    Times.Once,
                    $"UserService.AssignClinicRoleAsync must call RemoveAsync(\"{expectedKey}\") to invalidate user profile cache");
            });
    }
}
