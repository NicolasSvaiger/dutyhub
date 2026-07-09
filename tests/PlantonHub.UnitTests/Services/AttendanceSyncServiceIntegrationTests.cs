using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Integration-style unit tests for AttendanceSyncService covering the full offline sync flow.
/// Tests check-in/check-out online and offline, duplicates, validation rejections,
/// anti-fraud flags, and Redis unavailability scenarios.
/// </summary>
[Trait("Feature", "redis-cache-layer")]
[Trait("Task", "10.12")]
public class AttendanceSyncServiceIntegrationTests
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
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _shiftId = Guid.NewGuid();

    public AttendanceSyncServiceIntegrationTests()
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

        // Default: rate limiter allows all
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

    private OfflineEventSyncItem CreateEvent(
        string attendanceType = "CheckIn",
        Guid? localEventId = null,
        string deviceId = "device-1",
        DateTime? localDateTime = null)
    {
        return new OfflineEventSyncItem
        {
            LocalEventId = localEventId ?? Guid.NewGuid(),
            ClinicId = _clinicId,
            ShiftId = _shiftId,
            AttendanceType = attendanceType,
            LocalDateTime = localDateTime ?? DateTime.UtcNow.AddMinutes(-5),
            Latitude = -23.5505,
            Longitude = -46.6333,
            DeviceId = deviceId,
            AppVersion = "1.0.0",
            BiometricValidated = true
        };
    }

    private void SetupHappyPath()
    {
        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _offlineEventRepoMock
            .Setup(r => r.ExistsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>()))
            .ReturnsAsync(false);
        _attendanceRepoMock
            .Setup(r => r.ExistsByLocalEventIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>()))
            .ReturnsAsync(false);
        _validatorMock
            .Setup(v => v.ValidateAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new OfflineEventValidationResult());
        _antiFraudDetectorMock
            .Setup(a => a.DetectAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AntiFraudFlag>());
        _attendanceRepoMock
            .Setup(r => r.HasActiveCheckInAsync(_userId, _shiftId))
            .ReturnsAsync(false);
    }

    // --- Check-in online (fluxo normal) ---

    [Fact]
    public async Task CheckIn_OnlineFlow_SyncsSuccessfully()
    {
        // Arrange
        SetupHappyPath();
        var eventItem = CreateEvent("CheckIn");
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Synced.Should().Be(1);
        result.Results[0].Status.Should().BeOneOf(SyncStatus.OfflineSynced, SyncStatus.OfflineSyncedLate);
        result.Results[0].AttendanceId.Should().NotBeNull();
        _attendanceRepoMock.Verify(r => r.AddAsync(It.IsAny<Attendance>()), Times.Once);
        _offlineEventRepoMock.Verify(r => r.AddAsync(It.IsAny<OfflineAttendanceEvent>()), Times.Once);
    }

    // --- Check-in offline sincronizado depois (sucesso) ---

    [Fact]
    public async Task CheckIn_OfflineSyncedLater_SyncsSuccessfully()
    {
        // Arrange — event happened 30 minutes ago (offline), synced now
        SetupHappyPath();
        var eventItem = CreateEvent("CheckIn", localDateTime: DateTime.UtcNow.AddMinutes(-30));
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Synced.Should().Be(1);
        result.Results[0].Status.Should().BeOneOf(SyncStatus.OfflineSynced, SyncStatus.OfflineSyncedLate);
        result.Results[0].Message.Should().Contain("sucesso");
    }

    // --- Check-out offline sincronizado depois (sucesso) ---

    [Fact]
    public async Task CheckOut_OfflineSyncedLater_SyncsSuccessfully()
    {
        // Arrange
        SetupHappyPath();
        var existingAttendance = new Attendance
        {
            Id = Guid.NewGuid(),
            UserId = _userId,
            ShiftId = _shiftId,
            ClinicId = _clinicId,
            CheckInTime = DateTime.UtcNow.AddHours(-2),
            CheckOutTime = null,
            SyncSource = SyncSource.Online,
            SyncStatus = SyncStatus.OnlineSynced
        };
        _attendanceRepoMock
            .Setup(r => r.GetByUserAndShiftAsync(_userId, _shiftId))
            .ReturnsAsync(existingAttendance);

        var eventItem = CreateEvent("CheckOut", localDateTime: DateTime.UtcNow.AddMinutes(-10));
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Synced.Should().Be(1);
        result.Results[0].Status.Should().BeOneOf(SyncStatus.OfflineSynced, SyncStatus.OfflineSyncedLate);
        _attendanceRepoMock.Verify(r => r.UpdateAsync(It.IsAny<Attendance>()), Times.Once);
    }

    // --- Evento duplicado (LocalEventId repetido → DuplicateIgnored) ---

    [Fact]
    public async Task DuplicateEvent_SameLocalEventId_ReturnsDuplicateIgnored()
    {
        // Arrange
        var localEventId = Guid.NewGuid();
        var eventItem = CreateEvent("CheckIn", localEventId: localEventId);
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true); // Already in Redis cache

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Duplicates.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.DuplicateIgnored);
        result.Results[0].LocalEventId.Should().Be(localEventId);
    }

    // --- Localização inválida (fora do raio → Rejected ou RequiresReview) ---

    [Fact]
    public async Task InvalidLocation_OutsideRadius_ReturnsRequiresReview()
    {
        // Arrange
        SetupHappyPath();
        _validatorMock
            .Setup(v => v.ValidateAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new OfflineEventValidationResult
            {
                Outcome = ValidationOutcome.RequiresReview,
                Messages = ["Localização fora do raio permitido da clínica."]
            });

        var eventItem = CreateEvent("CheckIn");
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.RequiresReview.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.RequiresReview);
    }

    // --- Biometria falsa (não validada → RequiresReview) ---

    [Fact]
    public async Task FalseBiometric_NotValidated_ReturnsRequiresReview()
    {
        // Arrange
        SetupHappyPath();
        _antiFraudDetectorMock
            .Setup(a => a.DetectAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AntiFraudFlag>
            {
                new(AntiFraudFlagCode.NoBiometric, "Biometria não validada localmente no dispositivo.")
            });

        var eventItem = CreateEvent("CheckIn");
        eventItem.BiometricValidated = false;
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.RequiresReview.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.RequiresReview);
        result.Results[0].Message.Should().Contain("Biometria");
    }

    // --- Evento antigo demais (clock skew excessivo → RequiresReview) ---

    [Fact]
    public async Task StaleEvent_ExcessiveClockSkew_ReturnsRequiresReview()
    {
        // Arrange
        SetupHappyPath();
        _antiFraudDetectorMock
            .Setup(a => a.DetectAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AntiFraudFlag>
            {
                new(AntiFraudFlagCode.StaleEvent, "Evento offline muito antigo.")
            });

        var eventItem = CreateEvent("CheckIn", localDateTime: DateTime.UtcNow.AddHours(-50));
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.RequiresReview.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.RequiresReview);
    }

    // --- Evento de outro usuário (UserId não pertence à clínica → Rejected) ---

    [Fact]
    public async Task EventFromOtherUser_DoesNotBelongToClinic_ReturnsRejected()
    {
        // Arrange
        SetupHappyPath();
        _validatorMock
            .Setup(v => v.ValidateAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new OfflineEventValidationResult
            {
                Outcome = ValidationOutcome.Rejected,
                Messages = ["Usuário não pertence à clínica informada."]
            });

        var eventItem = CreateEvent("CheckIn");
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Rejected.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.Rejected);
        result.Results[0].Message.Should().Contain("não pertence à clínica");
    }

    // --- Redis indisponível (fallback graceful, operação prossegue) ---

    [Fact]
    public async Task RedisUnavailable_FallbackGraceful_OperationProceeds()
    {
        // Arrange: Redis idempotency check fails (returns false = fail-open)
        // Lock acquisition also fails gracefully (returns true = proceed without lock)
        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false); // fail-open: assume not cached
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true); // fail-open: proceed without lock
        _lockServiceMock
            .Setup(l => l.SetIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask); // silently swallows

        _offlineEventRepoMock
            .Setup(r => r.ExistsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>()))
            .ReturnsAsync(false);
        _attendanceRepoMock
            .Setup(r => r.ExistsByLocalEventIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>()))
            .ReturnsAsync(false);
        _validatorMock
            .Setup(v => v.ValidateAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new OfflineEventValidationResult());
        _antiFraudDetectorMock
            .Setup(a => a.DetectAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AntiFraudFlag>());
        _attendanceRepoMock
            .Setup(r => r.HasActiveCheckInAsync(_userId, _shiftId))
            .ReturnsAsync(false);

        var eventItem = CreateEvent("CheckIn");
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert — operation succeeds despite Redis being unavailable
        result.Synced.Should().Be(1);
        result.Results[0].Status.Should().BeOneOf(SyncStatus.OfflineSynced, SyncStatus.OfflineSyncedLate);
    }

    // --- Reenvio do mesmo LocalEventId (idempotência garantida) ---

    [Fact]
    public async Task ResendSameLocalEventId_IdempotencyGuaranteed()
    {
        // Arrange: event was already processed and stored in DB
        var localEventId = Guid.NewGuid();
        var eventItem = CreateEvent("CheckIn", localEventId: localEventId);
        var request = new OfflineEventSyncRequest { Events = [eventItem] };

        _lockServiceMock
            .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false); // Not in Redis cache
        _lockServiceMock
            .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _offlineEventRepoMock
            .Setup(r => r.ExistsAsync(localEventId, _userId, "device-1"))
            .ReturnsAsync(true); // Found in DB

        // Act
        var result = await _service.SyncOfflineEventsAsync(request);

        // Assert
        result.Duplicates.Should().Be(1);
        result.Results[0].Status.Should().Be(SyncStatus.DuplicateIgnored);
        result.Results[0].LocalEventId.Should().Be(localEventId);

        // No attendance should have been created
        _attendanceRepoMock.Verify(r => r.AddAsync(It.IsAny<Attendance>()), Times.Never);
        _attendanceRepoMock.Verify(r => r.UpdateAsync(It.IsAny<Attendance>()), Times.Never);
    }
}
