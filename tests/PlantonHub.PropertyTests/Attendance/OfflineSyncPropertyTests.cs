using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Microsoft.Extensions.Options;
using Moq;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.PropertyTests.Attendance;

/// <summary>
/// Property-based tests for offline attendance synchronization.
/// Covers idempotency, geolocation validation, and anti-fraud flag detection.
/// 
/// Feature: redis-cache-layer, Task: 10.12
/// </summary>
[Trait("Feature", "redis-cache-layer")]
[Trait("Task", "10.12")]
public class OfflineSyncPropertyTests
{
    // --- Generators ---

    private static Gen<Guid> GuidGen => Arb.Generate<Guid>();

    private static Gen<double> LatitudeGen => Gen.Choose(-89000, 89000).Select(i => i / 1000.0);
    private static Gen<double> LongitudeGen => Gen.Choose(-179000, 179000).Select(i => i / 1000.0);

    private static Gen<string> DeviceIdGen => Gen.Elements(
        "device-001", "device-002", "iphone-abc", "android-xyz", "tablet-123");

    private static Gen<string> AppVersionGen => Gen.Elements("1.0.0", "1.1.0", "2.0.0", "2.1.0");

    private static Gen<string> AttendanceTypeGen => Gen.Elements("CheckIn", "CheckOut");

    private static Gen<OfflineEventSyncItem> ValidEventGen =>
        from localEventId in GuidGen
        from clinicId in GuidGen
        from shiftId in GuidGen
        from attendanceType in AttendanceTypeGen
        from lat in LatitudeGen
        from lng in LongitudeGen
        from deviceId in DeviceIdGen
        from appVersion in AppVersionGen
        from biometric in Arb.Generate<bool>()
        select new OfflineEventSyncItem
        {
            LocalEventId = localEventId,
            ClinicId = clinicId,
            ShiftId = shiftId,
            AttendanceType = attendanceType,
            LocalDateTime = DateTime.UtcNow.AddMinutes(-5),
            Latitude = lat,
            Longitude = lng,
            DeviceId = deviceId,
            AppVersion = appVersion,
            BiometricValidated = biometric
        };

    // ===================================================================
    // Property 13: Idempotência — mesmo LocalEventId nunca gera duplicidade
    // ===================================================================

    /// <summary>
    /// Property 13: Idempotência — mesmo LocalEventId nunca gera duplicidade.
    /// For any valid OfflineEventSyncItem, if processed twice with the same
    /// LocalEventId+UserId+DeviceId, the second processing always returns DuplicateIgnored.
    /// 
    /// **Validates: Requirements 10.3**
    /// </summary>
    [Property(MaxTest = 100)]
    public Property Idempotency_SameLocalEventId_NeverCreatesDuplicate()
    {
        return Prop.ForAll(Arb.From(ValidEventGen), eventItem =>
        {
            // Force CheckIn for a clean flow
            eventItem.AttendanceType = "CheckIn";

            var userId = Guid.NewGuid();

            // --- Shared mocks ---
            var attendanceRepoMock = new Mock<IAttendanceRepository>();
            var offlineEventRepoMock = new Mock<IOfflineAttendanceEventRepository>();
            var shiftRepoMock = new Mock<IShiftRepository>();
            var tenantServiceMock = new Mock<ITenantService>();
            var lockServiceMock = new Mock<IDistributedLockService>();
            var validatorMock = new Mock<IOfflineEventValidator>();
            var antiFraudDetectorMock = new Mock<IAntiFraudDetector>();
            var syncAuditServiceMock = new Mock<IOfflineSyncAuditService>();

            tenantServiceMock.Setup(t => t.GetCurrentUserId()).Returns(userId);

            lockServiceMock
                .Setup(l => l.IsRateLimitedAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(false);
            lockServiceMock
                .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(true);

            // First call: not a duplicate — second call: IS a duplicate (DB already has it)
            var callCount = 0;
            offlineEventRepoMock
                .Setup(r => r.ExistsAsync(eventItem.LocalEventId, userId, eventItem.DeviceId))
                .Returns(() =>
                {
                    callCount++;
                    return Task.FromResult(callCount > 1);
                });

            attendanceRepoMock
                .Setup(r => r.ExistsByLocalEventIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>()))
                .ReturnsAsync(false);
            attendanceRepoMock
                .Setup(r => r.HasActiveCheckInAsync(userId, eventItem.ShiftId))
                .ReturnsAsync(false);

            // Idempotency key: first time doesn't exist, second time exists
            var idempCallCount = 0;
            lockServiceMock
                .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .Returns(() =>
                {
                    idempCallCount++;
                    return Task.FromResult(idempCallCount > 1);
                });

            validatorMock
                .Setup(v => v.ValidateAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new OfflineEventValidationResult());
            antiFraudDetectorMock
                .Setup(a => a.DetectAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new List<AntiFraudFlag>());

            var service = new AttendanceSyncService(
                attendanceRepoMock.Object,
                offlineEventRepoMock.Object,
                shiftRepoMock.Object,
                tenantServiceMock.Object,
                lockServiceMock.Object,
                validatorMock.Object,
                antiFraudDetectorMock.Object,
                syncAuditServiceMock.Object);

            // --- First call: should succeed ---
            var request1 = new OfflineEventSyncRequest { Events = [eventItem] };
            var result1 = service.SyncOfflineEventsAsync(request1).Result;

            // --- Second call with same LocalEventId: should be DuplicateIgnored ---
            var request2 = new OfflineEventSyncRequest { Events = [eventItem] };
            var result2 = service.SyncOfflineEventsAsync(request2).Result;

            // The second submission must ALWAYS be DuplicateIgnored
            var secondIsDuplicate = result2.Results[0].Status == SyncStatus.DuplicateIgnored;

            return secondIsDuplicate.ToProperty()
                .Label($"Second submission with LocalEventId={eventItem.LocalEventId} should be DuplicateIgnored but was {result2.Results[0].Status}");
        });
    }

    // ===================================================================
    // Property 14: Validação rejeita eventos com localização fora do raio
    // ===================================================================

    /// <summary>
    /// Property 14: Validação rejeita eventos com localização fora do raio.
    /// For any event where the Haversine distance between event coordinates and clinic
    /// coordinates exceeds the allowed radius, the validation should flag it as RequiresReview.
    /// 
    /// **Validates: Requirements 10.4**
    /// </summary>
    [Property(MaxTest = 100)]
    public Property Validation_RejectsEvents_WithLocationOutsideRadius()
    {
        // Generate a clinic location and an event that is always far away
        var testDataGen =
            from clinicLat in Gen.Choose(-80000, 80000).Select(i => i / 1000.0)
            from clinicLng in Gen.Choose(-170000, 170000).Select(i => i / 1000.0)
            from allowedRadius in Gen.Choose(100, 2000).Select(i => (double)i)
            // Ensure event is far away from clinic (at least 1 degree offset = ~111km)
            from latOffset in Gen.Choose(10, 50).Select(i => i / 10.0)
            from lngOffset in Gen.Choose(10, 50).Select(i => i / 10.0)
            let eventLat = Math.Clamp(clinicLat + latOffset, -90, 90)
            let eventLng = Math.Clamp(clinicLng + lngOffset, -180, 180)
            select new
            {
                ClinicLat = clinicLat,
                ClinicLng = clinicLng,
                AllowedRadius = allowedRadius,
                EventLat = eventLat,
                EventLng = eventLng
            };

        return Prop.ForAll(Arb.From(testDataGen), data =>
        {
            // First, verify our test data: the distance must actually exceed the radius
            var distance = OfflineEventValidator.CalculateHaversineDistance(
                data.ClinicLat, data.ClinicLng, data.EventLat, data.EventLng);

            // Only test when the distance truly exceeds the allowed radius
            if (distance <= data.AllowedRadius)
                return true.ToProperty().Label("Skipped: generated coordinates within radius");

            // Set up the validator with real Haversine logic
            var clinicId = Guid.NewGuid();
            var userId = Guid.NewGuid();
            var shiftId = Guid.NewGuid();

            var clinicRepoMock = new Mock<IClinicRepository>();
            var shiftRepoMock = new Mock<IShiftRepository>();
            var attendanceRepoMock = new Mock<IAttendanceRepository>();

            clinicRepoMock
                .Setup(r => r.UserBelongsToClinicAsync(userId, clinicId))
                .ReturnsAsync(true);
            shiftRepoMock
                .Setup(r => r.AssignmentExistsAsync(shiftId, userId))
                .ReturnsAsync(true);
            clinicRepoMock
                .Setup(r => r.GetByIdAsync(clinicId))
                .ReturnsAsync(new Clinic
                {
                    Id = clinicId,
                    Latitude = data.ClinicLat,
                    Longitude = data.ClinicLng,
                    AllowedRadiusMeters = data.AllowedRadius
                });

            var validator = new OfflineEventValidator(
                clinicRepoMock.Object,
                shiftRepoMock.Object,
                attendanceRepoMock.Object);

            var eventItem = new OfflineEventSyncItem
            {
                LocalEventId = Guid.NewGuid(),
                ClinicId = clinicId,
                ShiftId = shiftId,
                AttendanceType = "CheckIn",
                LocalDateTime = DateTime.UtcNow.AddMinutes(-2),
                Latitude = data.EventLat,
                Longitude = data.EventLng,
                DeviceId = "test-device",
                AppVersion = "1.0.0",
                BiometricValidated = true
            };

            var result = validator.ValidateAsync(eventItem, userId).Result;

            // Events outside the radius should be flagged for review
            var isFlaggedOrRejected = result.Outcome == ValidationOutcome.RequiresReview
                                      || result.Outcome == ValidationOutcome.Rejected;
            var hasGeoMessage = result.Messages.Any(m => m.Contains("raio permitido"));

            return (isFlaggedOrRejected && hasGeoMessage).ToProperty()
                .Label($"Distance={distance:F0}m, Radius={data.AllowedRadius}m, Outcome={result.Outcome}");
        });
    }

    // ===================================================================
    // Property 15: Eventos com flags antifraude recebem RequiresReview
    // ===================================================================

    /// <summary>
    /// Property 15: Eventos com flags antifraude recebem RequiresReview.
    /// For any event with at least one anti-fraud flag (stale, clock skew, geofence,
    /// unknown device, no biometric, outdated app, replay), the sync result should be RequiresReview.
    /// 
    /// **Validates: Requirements 10.6**
    /// </summary>
    [Property(MaxTest = 100)]
    public Property AntiFraudFlags_AlwaysResultIn_RequiresReview()
    {
        // Generate at least one anti-fraud flag
        var flagCodeGen = Gen.Elements(
            AntiFraudFlagCode.StaleEvent,
            AntiFraudFlagCode.ClockSkew,
            AntiFraudFlagCode.GeoFence,
            AntiFraudFlagCode.UnknownDevice,
            AntiFraudFlagCode.NoBiometric,
            AntiFraudFlagCode.OutdatedApp,
            AntiFraudFlagCode.ReplayAttack);

        var flagsGen = Gen.NonEmptyListOf(flagCodeGen)
            .Select(codes => codes.Distinct().Select(c => new AntiFraudFlag(c, $"Flag: {c}")).ToList());

        var testDataGen =
            from flags in flagsGen
            from eventItem in ValidEventGen
            select new { Flags = flags, EventItem = eventItem };

        return Prop.ForAll(Arb.From(testDataGen), data =>
        {
            // Force CheckIn for simplicity
            data.EventItem.AttendanceType = "CheckIn";

            var userId = Guid.NewGuid();

            var attendanceRepoMock = new Mock<IAttendanceRepository>();
            var offlineEventRepoMock = new Mock<IOfflineAttendanceEventRepository>();
            var shiftRepoMock = new Mock<IShiftRepository>();
            var tenantServiceMock = new Mock<ITenantService>();
            var lockServiceMock = new Mock<IDistributedLockService>();
            var validatorMock = new Mock<IOfflineEventValidator>();
            var antiFraudDetectorMock = new Mock<IAntiFraudDetector>();
            var syncAuditServiceMock = new Mock<IOfflineSyncAuditService>();

            tenantServiceMock.Setup(t => t.GetCurrentUserId()).Returns(userId);

            lockServiceMock
                .Setup(l => l.IsRateLimitedAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(false);
            lockServiceMock
                .Setup(l => l.ExistsIdempotencyKeyAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(false);
            lockServiceMock
                .Setup(l => l.TryAcquireLockAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(true);
            offlineEventRepoMock
                .Setup(r => r.ExistsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>()))
                .ReturnsAsync(false);
            attendanceRepoMock
                .Setup(r => r.ExistsByLocalEventIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>()))
                .ReturnsAsync(false);
            attendanceRepoMock
                .Setup(r => r.HasActiveCheckInAsync(userId, data.EventItem.ShiftId))
                .ReturnsAsync(false);

            // Validator passes (not rejected)
            validatorMock
                .Setup(v => v.ValidateAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new OfflineEventValidationResult());

            // Anti-fraud detector returns at least one flag
            antiFraudDetectorMock
                .Setup(a => a.DetectAsync(It.IsAny<OfflineEventSyncItem>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(data.Flags);

            var service = new AttendanceSyncService(
                attendanceRepoMock.Object,
                offlineEventRepoMock.Object,
                shiftRepoMock.Object,
                tenantServiceMock.Object,
                lockServiceMock.Object,
                validatorMock.Object,
                antiFraudDetectorMock.Object,
                syncAuditServiceMock.Object);

            var request = new OfflineEventSyncRequest { Events = [data.EventItem] };
            var result = service.SyncOfflineEventsAsync(request).Result;

            var isRequiresReview = result.Results[0].Status == SyncStatus.RequiresReview;
            var flagNames = string.Join(", ", data.Flags.Select(f => f.Code.ToString()));

            return isRequiresReview.ToProperty()
                .Label($"Flags [{flagNames}] should result in RequiresReview but got {result.Results[0].Status}");
        });
    }
}
