using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Unit tests for OfflineEventValidator.
/// Validates user-clinic membership, shift assignment, temporal order,
/// geolocation (Haversine), biometric validation, and clock skew detection.
/// </summary>
[Trait("Feature", "redis-cache-layer")]
public class OfflineEventValidatorTests
{
    private readonly Mock<IClinicRepository> _clinicRepoMock;
    private readonly Mock<IShiftRepository> _shiftRepoMock;
    private readonly Mock<IAttendanceRepository> _attendanceRepoMock;
    private readonly OfflineEventValidator _validator;
    private readonly Guid _userId = Guid.NewGuid();
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _shiftId = Guid.NewGuid();

    public OfflineEventValidatorTests()
    {
        _clinicRepoMock = new Mock<IClinicRepository>();
        _shiftRepoMock = new Mock<IShiftRepository>();
        _attendanceRepoMock = new Mock<IAttendanceRepository>();

        _validator = new OfflineEventValidator(
            _clinicRepoMock.Object,
            _shiftRepoMock.Object,
            _attendanceRepoMock.Object);
    }

    private OfflineEventSyncItem CreateValidCheckInEvent()
    {
        return new OfflineEventSyncItem
        {
            LocalEventId = Guid.NewGuid(),
            ClinicId = _clinicId,
            ShiftId = _shiftId,
            AttendanceType = "CheckIn",
            LocalDateTime = DateTime.UtcNow.AddMinutes(-5),
            Latitude = -23.5505,
            Longitude = -46.6333,
            DeviceId = "device-1",
            AppVersion = "1.0.0",
            BiometricValidated = true
        };
    }

    private void SetupValidDefaults()
    {
        _clinicRepoMock
            .Setup(r => r.UserBelongsToClinicAsync(_userId, _clinicId))
            .ReturnsAsync(true);

        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(_shiftId, _userId))
            .ReturnsAsync(true);

        _clinicRepoMock
            .Setup(r => r.GetByIdAsync(_clinicId))
            .ReturnsAsync(new Clinic
            {
                Id = _clinicId,
                Name = "Test Clinic",
                Latitude = -23.5505,
                Longitude = -46.6333,
                AllowedRadiusMeters = 500
            });
    }

    // --- User-Clinic Membership ---

    [Fact]
    public async Task ValidateAsync_UserDoesNotBelongToClinic_ReturnsRejected()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        _clinicRepoMock
            .Setup(r => r.UserBelongsToClinicAsync(_userId, _clinicId))
            .ReturnsAsync(false);

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.Rejected);
        result.Messages.Should().Contain(m => m.Contains("não pertence à clínica"));
    }

    [Fact]
    public async Task ValidateAsync_UserBelongsToClinic_DoesNotReject()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        SetupValidDefaults();

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().NotBe(ValidationOutcome.Rejected);
    }

    // --- Shift Assignment ---

    [Fact]
    public async Task ValidateAsync_UserNotAssignedToShift_ReturnsRejected()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        _clinicRepoMock
            .Setup(r => r.UserBelongsToClinicAsync(_userId, _clinicId))
            .ReturnsAsync(true);
        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(_shiftId, _userId))
            .ReturnsAsync(false);

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.Rejected);
        result.Messages.Should().Contain(m => m.Contains("não está vinculado ao plantão"));
    }

    // --- Temporal Order ---

    [Fact]
    public async Task ValidateAsync_CheckOutWithNoCheckIn_ReturnsRejected()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        eventItem.AttendanceType = "CheckOut";

        _clinicRepoMock
            .Setup(r => r.UserBelongsToClinicAsync(_userId, _clinicId))
            .ReturnsAsync(true);
        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(_shiftId, _userId))
            .ReturnsAsync(true);
        _attendanceRepoMock
            .Setup(r => r.GetByUserAndShiftAsync(_userId, _shiftId))
            .ReturnsAsync((Attendance?)null);
        _clinicRepoMock
            .Setup(r => r.GetByIdAsync(_clinicId))
            .ReturnsAsync(new Clinic { Id = _clinicId, Latitude = -23.5505, Longitude = -46.6333 });

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.Rejected);
        result.Messages.Should().Contain(m => m.Contains("check-in anterior"));
    }

    [Fact]
    public async Task ValidateAsync_CheckOutBeforeCheckIn_ReturnsRejected()
    {
        // Arrange
        var checkInTime = DateTime.UtcNow.AddHours(-1);
        var eventItem = CreateValidCheckInEvent();
        eventItem.AttendanceType = "CheckOut";
        eventItem.LocalDateTime = checkInTime.AddMinutes(-10); // Before check-in

        _clinicRepoMock
            .Setup(r => r.UserBelongsToClinicAsync(_userId, _clinicId))
            .ReturnsAsync(true);
        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(_shiftId, _userId))
            .ReturnsAsync(true);
        _attendanceRepoMock
            .Setup(r => r.GetByUserAndShiftAsync(_userId, _shiftId))
            .ReturnsAsync(new Attendance
            {
                Id = Guid.NewGuid(),
                UserId = _userId,
                ShiftId = _shiftId,
                ClinicId = _clinicId,
                CheckInTime = checkInTime
            });
        _clinicRepoMock
            .Setup(r => r.GetByIdAsync(_clinicId))
            .ReturnsAsync(new Clinic { Id = _clinicId, Latitude = -23.5505, Longitude = -46.6333 });

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.Rejected);
        result.Messages.Should().Contain(m => m.Contains("posterior ao horário do check-in"));
    }

    [Fact]
    public async Task ValidateAsync_CheckOutAfterCheckIn_DoesNotRejectForTemporalOrder()
    {
        // Arrange
        var checkInTime = DateTime.UtcNow.AddHours(-1);
        var eventItem = CreateValidCheckInEvent();
        eventItem.AttendanceType = "CheckOut";
        eventItem.LocalDateTime = checkInTime.AddMinutes(30); // After check-in

        SetupValidDefaults();
        _attendanceRepoMock
            .Setup(r => r.GetByUserAndShiftAsync(_userId, _shiftId))
            .ReturnsAsync(new Attendance
            {
                Id = Guid.NewGuid(),
                UserId = _userId,
                ShiftId = _shiftId,
                ClinicId = _clinicId,
                CheckInTime = checkInTime
            });

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Messages.Should().NotContain(m => m.Contains("posterior ao horário do check-in"));
    }

    // --- Geolocation ---

    [Fact]
    public async Task ValidateAsync_LocationOutsideRadius_ReturnsFlaggedForReview()
    {
        // Arrange - São Paulo clinic, event from Rio de Janeiro (~360km away)
        var eventItem = CreateValidCheckInEvent();
        eventItem.Latitude = -22.9068; // Rio de Janeiro
        eventItem.Longitude = -43.1729;

        _clinicRepoMock
            .Setup(r => r.UserBelongsToClinicAsync(_userId, _clinicId))
            .ReturnsAsync(true);
        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(_shiftId, _userId))
            .ReturnsAsync(true);
        _clinicRepoMock
            .Setup(r => r.GetByIdAsync(_clinicId))
            .ReturnsAsync(new Clinic
            {
                Id = _clinicId,
                Latitude = -23.5505, // São Paulo
                Longitude = -46.6333,
                AllowedRadiusMeters = 500
            });

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.RequiresReview);
        result.Messages.Should().Contain(m => m.Contains("fora do raio permitido"));
    }

    [Fact]
    public async Task ValidateAsync_LocationInsideRadius_DoesNotFlag()
    {
        // Arrange - same location as clinic
        var eventItem = CreateValidCheckInEvent();
        SetupValidDefaults();

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Messages.Should().NotContain(m => m.Contains("fora do raio permitido"));
    }

    [Fact]
    public async Task ValidateAsync_ClinicWithoutCoordinates_SkipsGeolocation()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        _clinicRepoMock
            .Setup(r => r.UserBelongsToClinicAsync(_userId, _clinicId))
            .ReturnsAsync(true);
        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(_shiftId, _userId))
            .ReturnsAsync(true);
        _clinicRepoMock
            .Setup(r => r.GetByIdAsync(_clinicId))
            .ReturnsAsync(new Clinic
            {
                Id = _clinicId,
                Latitude = null,
                Longitude = null
            });

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Messages.Should().NotContain(m => m.Contains("fora do raio"));
    }

    [Fact]
    public async Task ValidateAsync_ClinicWithoutConfiguredRadius_UsesDefaultOf500m()
    {
        // Arrange - 600m away from clinic (outside default 500m radius)
        var eventItem = CreateValidCheckInEvent();
        // Offset longitude by ~600m (at -23.5 lat, ~0.0065 degrees ≈ 600m)
        eventItem.Longitude = -46.6333 + 0.0065;

        _clinicRepoMock
            .Setup(r => r.UserBelongsToClinicAsync(_userId, _clinicId))
            .ReturnsAsync(true);
        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(_shiftId, _userId))
            .ReturnsAsync(true);
        _clinicRepoMock
            .Setup(r => r.GetByIdAsync(_clinicId))
            .ReturnsAsync(new Clinic
            {
                Id = _clinicId,
                Latitude = -23.5505,
                Longitude = -46.6333,
                AllowedRadiusMeters = null // should use default 500m
            });

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.RequiresReview);
        result.Messages.Should().Contain(m => m.Contains("fora do raio permitido"));
    }

    // --- Biometric ---

    [Fact]
    public async Task ValidateAsync_BiometricNotValidated_ReturnsFlaggedForReview()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        eventItem.BiometricValidated = false;
        SetupValidDefaults();

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.RequiresReview);
        result.Messages.Should().Contain(m => m.Contains("Biometria não foi validada"));
    }

    [Fact]
    public async Task ValidateAsync_BiometricValidated_DoesNotFlag()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        eventItem.BiometricValidated = true;
        SetupValidDefaults();

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Messages.Should().NotContain(m => m.Contains("Biometria"));
    }

    // --- Clock Skew ---

    [Fact]
    public async Task ValidateAsync_EventInFuture_ReturnsFlaggedForReview()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        eventItem.LocalDateTime = DateTime.UtcNow.AddMinutes(30); // 30 minutes in the future
        SetupValidDefaults();

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.RequiresReview);
        result.Messages.Should().Contain(m => m.Contains("futuro"));
    }

    [Fact]
    public async Task ValidateAsync_EventTooOld_ReturnsFlaggedForReview()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        eventItem.LocalDateTime = DateTime.UtcNow.AddHours(-25); // 25 hours in the past
        SetupValidDefaults();

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.RequiresReview);
        result.Messages.Should().Contain(m => m.Contains("Diferença excessiva"));
    }

    [Fact]
    public async Task ValidateAsync_EventWithinAcceptableTimeRange_DoesNotFlagClockSkew()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        eventItem.LocalDateTime = DateTime.UtcNow.AddMinutes(-5); // 5 minutes ago
        SetupValidDefaults();

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Messages.Should().NotContain(m => m.Contains("futuro"));
        result.Messages.Should().NotContain(m => m.Contains("Diferença excessiva"));
    }

    // --- All validations pass ---

    [Fact]
    public async Task ValidateAsync_AllValidationsPass_ReturnsAccepted()
    {
        // Arrange
        var eventItem = CreateValidCheckInEvent();
        SetupValidDefaults();

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.Accepted);
        result.Messages.Should().BeEmpty();
    }

    // --- Multiple flags ---

    [Fact]
    public async Task ValidateAsync_MultipleFlags_AccumulatesMessages()
    {
        // Arrange - biometric not validated AND clock skew
        var eventItem = CreateValidCheckInEvent();
        eventItem.BiometricValidated = false;
        eventItem.LocalDateTime = DateTime.UtcNow.AddHours(-25);
        SetupValidDefaults();

        // Act
        var result = await _validator.ValidateAsync(eventItem, _userId);

        // Assert
        result.Outcome.Should().Be(ValidationOutcome.RequiresReview);
        result.Messages.Should().HaveCountGreaterThanOrEqualTo(2);
        result.Messages.Should().Contain(m => m.Contains("Biometria"));
        result.Messages.Should().Contain(m => m.Contains("Diferença excessiva"));
    }

    // --- Haversine formula unit test ---

    [Fact]
    public void CalculateHaversineDistance_SamePoint_ReturnsZero()
    {
        var distance = OfflineEventValidator.CalculateHaversineDistance(
            -23.5505, -46.6333, -23.5505, -46.6333);

        distance.Should().Be(0);
    }

    [Fact]
    public void CalculateHaversineDistance_KnownDistance_ReturnsApproximateValue()
    {
        // São Paulo to Rio de Janeiro is approximately 358km
        var distance = OfflineEventValidator.CalculateHaversineDistance(
            -23.5505, -46.6333, // São Paulo
            -22.9068, -43.1729); // Rio de Janeiro

        distance.Should().BeApproximately(357_000, 5000); // ~357km ± 5km tolerance
    }

    [Fact]
    public void CalculateHaversineDistance_ShortDistance_ReturnsMeters()
    {
        // Two points approximately 100m apart
        // At equator, 0.001 degrees latitude ≈ 111m
        var distance = OfflineEventValidator.CalculateHaversineDistance(
            0.0, 0.0,
            0.001, 0.0);

        distance.Should().BeApproximately(111, 5); // ~111m ± 5m
    }
}
