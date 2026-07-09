using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Unit tests for AttendanceSyncService idempotency logic.
/// Validates that the combination of LocalEventId + UserId + DeviceId prevents duplicate processing.
/// Uses Redis distributed lock and idempotency cache before falling back to DB check.
/// </summary>
[Trait("Feature", "redis-cache-layer")]
public class AttendanceSyncServiceTests
{
    private readonly Mock<IAttendanceRepository> _attendanceRepoMock;
    private readonly Mock<IOfflineAttendanceEventRepository> _offlineEventRepoMock;
    private readonly Mock<IShiftRepository> _shiftRepoMock;
    private readonly Mock<ITenantService> _tenantServiceMock;
    private readonly Mock<IDistributedLockService> _lockServiceMock;
    private readonly Mock<IOfflineEventValidator> _validatorMock;
    private readonly Mock<IAntiFraudDetector> _antiFraudDetectorMock;
    private readonly Mock<IOfflineSyncAuditService> _syncAuditServiceMock;
    private readonly AttendanceSyncService _service;
    private readonly Guid _userId = Guid.NewGuid();

    public AttendanceSyncServiceTests()
    {
        _attendanceRepoMock = new Mock<IAttendanceRepository>();
        _offlineEventRepoMock = new Mock<IOfflineAttendanceEventRepository>();
        _shiftRepoMock = new Mock<IShiftRepository>();
        _tenantServiceMock = new Mock<ITenantService>();
        _lockServiceMock = new Mock<IDistributedLockService>();
        _validatorMock = new Mock<IOfflineEventValidator>();
        _antiFraudDetectorMock = new Mock<IAntiFraudDetector>();
        _syncAuditServiceMock = new Mock<IOfflineSyncAuditService>();

        _tenantServiceMock.Setup(t => t.GetCurrentUserId()).Returns(_userId);

        // By default, the validator passes all events
        _validatorMock
            .Setup(v => v.ValidateAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new OfflineEventValidationResult());

        // By default, the anti-fraud detector returns no flags
        _antiFraudDetectorMock
            .Setup(a => a.DetectAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AntiFraudFlag>());

        // By default, the rate limiter allows all requests
        _lockServiceMock
            .Setup(l => l.IsRateLimitedAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        _service = new AttendanceSyncService(
            _attendanceRepoMock.Object,
            _offlineEventRepoMock.Object,
            _shiftRepoMock.Object,
            _tenantServiceMock.Object,
            _lockServiceMock.Object,
            _validatorMock.Object,
            _antiFraudDetectorMock.Object,
            _syncAuditServiceMock.Object);
    }

    private OfflineEventSyncItem CreateValidEvent(Guid? localEventId = null, string deviceId = "device-1")
    {
        return new OfflineEventSyncItem
        {
            LocalEventId = localEventId ?? Guid.NewGuid(),
            ClinicId = Guid.NewGuid(),
            ShiftId = Guid.NewGuid(),
            AttendanceType = "CheckIn",
            LocalDateTime = DateTime.UtcNow.AddMinutes(-5),
            Latitude = -23.5505,
            Longitude = -46.6333,
            DeviceId = deviceId,
            AppVersion = "1.0.0",
            BiometricValidated = true
        };
    }

    [Fact]
    public async Task SyncOfflineEventsAsync_WhenIdempotencyKeyExistsInRedis_ReturnsDuplicateIgnored()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        var request = new OfflineEventSyncRequest { Events = new List<OfflineEventSyncItem> { eventItem } };

        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Duplicates.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.DuplicateIgnored);

        // Should NOT attempt to acquire lock or check DB
        _lockServiceMock.Verify(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Never);
        _offlineEventRepoMock.Verify(r => r.ExistsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SyncOfflineEventsAsync_WhenLockNotAcquired_ReturnsDuplicateIgnored()
    {
        // Arrange — another process holds the lock for this event
        var eventItem = CreateValidEvent();
        var request = new OfflineEventSyncRequest { Events = new List<OfflineEventSyncItem> { eventItem } };

        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Duplicates.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.DuplicateIgnored);
        result.Results[0].Message.Should().Contain("outra requisição");
    }

    [Fact]
    public async Task SyncOfflineEventsAsync_WhenDuplicateFoundInOfflineEventTable_ReturnsDuplicateIgnored()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        var request = new OfflineEventSyncRequest { Events = new List<OfflineEventSyncItem> { eventItem } };

        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _offlineEventRepoMock
            .Setup(r => r.ExistsAsync(eventItem.LocalEventId, _userId, eventItem.DeviceId))
            .ReturnsAsync(true);

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Duplicates.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.DuplicateIgnored);

        // Should set idempotency cache for future fast detection
        _lockServiceMock.Verify(l => l.SetIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Once);
        // Should release the lock
        _lockServiceMock.Verify(l => l.ReleaseLockAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SyncOfflineEventsAsync_WhenDuplicateFoundInAttendanceTable_ReturnsDuplicateIgnored()
    {
        // Arrange — not in OfflineAttendanceEvent but already in Attendance table (backward compat)
        var eventItem = CreateValidEvent();
        var request = new OfflineEventSyncRequest { Events = new List<OfflineEventSyncItem> { eventItem } };

        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _offlineEventRepoMock
            .Setup(r => r.ExistsAsync(eventItem.LocalEventId, _userId, eventItem.DeviceId))
            .ReturnsAsync(false);
        _attendanceRepoMock
            .Setup(r => r.ExistsByLocalEventIdAsync(eventItem.LocalEventId, _userId, eventItem.DeviceId))
            .ReturnsAsync(true);

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Duplicates.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.DuplicateIgnored);
        _lockServiceMock.Verify(l => l.SetIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Once);
        _lockServiceMock.Verify(l => l.ReleaseLockAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SyncOfflineEventsAsync_NewEvent_AcquiresLockAndProcessesSuccessfully()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        var request = new OfflineEventSyncRequest { Events = new List<OfflineEventSyncItem> { eventItem } };

        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _offlineEventRepoMock
            .Setup(r => r.ExistsAsync(eventItem.LocalEventId, _userId, eventItem.DeviceId))
            .ReturnsAsync(false);
        _attendanceRepoMock
            .Setup(r => r.ExistsByLocalEventIdAsync(eventItem.LocalEventId, _userId, eventItem.DeviceId))
            .ReturnsAsync(false);
        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(eventItem.ShiftId, _userId))
            .ReturnsAsync(true);
        _attendanceRepoMock
            .Setup(r => r.HasActiveCheckInAsync(_userId, eventItem.ShiftId))
            .ReturnsAsync(false);

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Synced.Should().Be(1);
        result.Results[0].Status.Should().BeOneOf(SyncStatus.OfflineSynced, SyncStatus.OfflineSyncedLate, SyncStatus.RequiresReview);
        result.Results[0].AttendanceId.Should().NotBeNull();

        // Should save to OfflineAttendanceEvent table
        _offlineEventRepoMock.Verify(r => r.AddAsync(It.IsAny<Domain.Entities.OfflineAttendanceEvent>()), Times.Once);
        // Should set idempotency cache
        _lockServiceMock.Verify(l => l.SetIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Once);
        // Should release lock
        _lockServiceMock.Verify(l => l.ReleaseLockAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SyncOfflineEventsAsync_SameEventSentTwice_SecondIsDuplicate()
    {
        // Arrange — simulate a batch with the same event sent twice
        var localEventId = Guid.NewGuid();
        var deviceId = "device-123";
        var eventItem1 = CreateValidEvent(localEventId, deviceId);
        var eventItem2 = CreateValidEvent(localEventId, deviceId);
        eventItem2.ClinicId = eventItem1.ClinicId;
        eventItem2.ShiftId = eventItem1.ShiftId;

        var request = new OfflineEventSyncRequest { Events = new List<OfflineEventSyncItem> { eventItem1, eventItem2 } };

        // First call: no cache, lock acquired, not in DB
        var callCount = 0;
        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() =>
            {
                callCount++;
                // Second call finds the idempotency key set by the first processing
                return callCount > 1;
            });
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _offlineEventRepoMock
            .Setup(r => r.ExistsAsync(localEventId, _userId, deviceId))
            .ReturnsAsync(false);
        _attendanceRepoMock
            .Setup(r => r.ExistsByLocalEventIdAsync(localEventId, _userId, deviceId))
            .ReturnsAsync(false);
        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(eventItem1.ShiftId, _userId))
            .ReturnsAsync(true);
        _attendanceRepoMock
            .Setup(r => r.HasActiveCheckInAsync(_userId, eventItem1.ShiftId))
            .ReturnsAsync(false);

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Synced.Should().Be(1);
        result.Duplicates.Should().Be(1);
    }

    [Fact]
    public async Task SyncOfflineEventsAsync_LockReleasedEvenOnException()
    {
        // Arrange — exception during processing
        var eventItem = CreateValidEvent();
        var request = new OfflineEventSyncRequest { Events = new List<OfflineEventSyncItem> { eventItem } };

        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _offlineEventRepoMock
            .Setup(r => r.ExistsAsync(eventItem.LocalEventId, _userId, eventItem.DeviceId))
            .ThrowsAsync(new InvalidOperationException("DB connection failed"));

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.SyncOfflineEventsAsync(request));

        // Lock should still be released via the finally block
        _lockServiceMock.Verify(l => l.ReleaseLockAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SyncOfflineEventsAsync_WhenRateLimitExceeded_ThrowsRateLimitExceededException()
    {
        // Arrange — rate limit is exceeded for this user/device
        var eventItem = CreateValidEvent();
        var request = new OfflineEventSyncRequest { Events = new List<OfflineEventSyncItem> { eventItem } };

        _lockServiceMock
            .Setup(l => l.IsRateLimitedAsync(_userId, eventItem.DeviceId, It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<RateLimitExceededException>(
            () => _service.SyncOfflineEventsAsync(request));

        exception.Message.Should().Contain("Taxa de sincronização excedida");

        // Should NOT attempt any lock or processing
        _lockServiceMock.Verify(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Never);
        _lockServiceMock.Verify(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SyncOfflineEventsAsync_WhenRateLimiterFails_ProceedsNormally()
    {
        // Arrange — rate limiter returns false (fail-open scenario, Redis unavailable returns false)
        var eventItem = CreateValidEvent();
        var request = new OfflineEventSyncRequest { Events = new List<OfflineEventSyncItem> { eventItem } };

        _lockServiceMock
            .Setup(l => l.IsRateLimitedAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _offlineEventRepoMock
            .Setup(r => r.ExistsAsync(eventItem.LocalEventId, _userId, eventItem.DeviceId))
            .ReturnsAsync(false);
        _attendanceRepoMock
            .Setup(r => r.ExistsByLocalEventIdAsync(eventItem.LocalEventId, _userId, eventItem.DeviceId))
            .ReturnsAsync(false);
        _shiftRepoMock
            .Setup(r => r.AssignmentExistsAsync(eventItem.ShiftId, _userId))
            .ReturnsAsync(true);
        _attendanceRepoMock
            .Setup(r => r.HasActiveCheckInAsync(_userId, eventItem.ShiftId))
            .ReturnsAsync(false);

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert — should process normally when rate limiter allows
        result.Synced.Should().Be(1);
    }
}
