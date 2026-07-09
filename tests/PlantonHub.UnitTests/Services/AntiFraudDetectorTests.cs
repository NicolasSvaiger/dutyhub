using FluentAssertions;
using Microsoft.Extensions.Options;
using Moq;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Unit tests for the AntiFraudDetector service.
/// Validates that each anti-fraud condition is correctly detected and flagged.
/// Events with flags result in RequiresReview status.
/// </summary>
public class AntiFraudDetectorTests
{
    private readonly Mock<IAttendanceRepository> _attendanceRepoMock;
    private readonly Mock<IClinicRepository> _clinicRepoMock;
    private readonly Mock<IDistributedLockService> _lockServiceMock;
    private readonly AntiFraudSettings _settings;
    private readonly AntiFraudDetector _detector;

    private static readonly Guid TestUserId = Guid.NewGuid();
    private static readonly Guid TestClinicId = Guid.NewGuid();
    private static readonly Guid TestShiftId = Guid.NewGuid();

    public AntiFraudDetectorTests()
    {
        _attendanceRepoMock = new Mock<IAttendanceRepository>();
        _clinicRepoMock = new Mock<IClinicRepository>();
        _lockServiceMock = new Mock<IDistributedLockService>();

        _settings = new AntiFraudSettings
        {
            StaleEventThresholdHours = 48,
            ClockSkewThresholdMinutes = 5,
            MinimumAppVersion = "1.0.0",
            ReplayAttackThreshold = 3,
            ReplayAttackWindowMinutes = 10
        };

        var optionsMock = Options.Create(_settings);

        // Default: user has known devices so UnknownDevice can be tested
        _attendanceRepoMock
            .Setup(x => x.GetKnownDeviceIdsAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { "known-device-001" });

        // Default: clinic with coordinates
        _clinicRepoMock
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(new Clinic
            {
                Id = TestClinicId,
                Name = "Test Clinic",
                Latitude = -23.5505,
                Longitude = -46.6333,
                AllowedRadiusMeters = 500
            });

        // Default: replay counter returns 1 (no replay)
        _lockServiceMock
            .Setup(x => x.IncrementCounterAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        _detector = new AntiFraudDetector(
            _attendanceRepoMock.Object,
            _clinicRepoMock.Object,
            _lockServiceMock.Object,
            optionsMock);
    }

    private OfflineEventSyncItem CreateValidEvent()
    {
        return new OfflineEventSyncItem
        {
            LocalEventId = Guid.NewGuid(),
            ClinicId = TestClinicId,
            ShiftId = TestShiftId,
            AttendanceType = "CheckIn",
            LocalDateTime = DateTime.UtcNow.AddMinutes(-2), // Recent event
            Latitude = -23.5505, // Same as clinic (within radius)
            Longitude = -46.6333,
            DeviceId = "known-device-001",
            AppVersion = "2.0.0",
            BiometricValidated = true
        };
    }

    [Fact]
    public async Task DetectAsync_ValidEvent_ReturnsNoFlags()
    {
        // Arrange
        var eventItem = CreateValidEvent();

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().BeEmpty();
    }

    // --- StaleEvent ---

    [Fact]
    public async Task DetectAsync_StaleEvent_FlagsStaleEvent()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.LocalDateTime = DateTime.UtcNow.AddHours(-49); // Older than 48h threshold

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.StaleEvent);
    }

    [Fact]
    public async Task DetectAsync_RecentEvent_NoStaleFlag()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.LocalDateTime = DateTime.UtcNow.AddHours(-1); // Well within threshold

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.StaleEvent);
    }

    // --- ClockSkew ---

    [Fact]
    public async Task DetectAsync_DeviceClockAhead_FlagsClockSkew()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.LocalDateTime = DateTime.UtcNow.AddMinutes(10); // 10 minutes in the future

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.ClockSkew);
    }

    [Fact]
    public async Task DetectAsync_DeviceClockSlightlyAhead_NoClockSkewFlag()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.LocalDateTime = DateTime.UtcNow.AddMinutes(3); // Within 5-minute tolerance

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.ClockSkew);
    }

    // --- GeoFence ---

    [Fact]
    public async Task DetectAsync_LocationOutsideRadius_FlagsGeoFence()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        // São Paulo to Rio de Janeiro (~360km away)
        eventItem.Latitude = -22.9068;
        eventItem.Longitude = -43.1729;

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.GeoFence);
    }

    [Fact]
    public async Task DetectAsync_LocationWithinRadius_NoGeoFenceFlag()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        // Very close to the clinic coordinates
        eventItem.Latitude = -23.5506;
        eventItem.Longitude = -46.6334;

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.GeoFence);
    }

    [Fact]
    public async Task DetectAsync_ClinicWithoutCoordinates_NoGeoFenceFlag()
    {
        // Arrange
        _clinicRepoMock
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(new Clinic
            {
                Id = TestClinicId,
                Name = "Clinic Without Coords",
                Latitude = null,
                Longitude = null
            });

        var eventItem = CreateValidEvent();
        eventItem.Latitude = -22.0;
        eventItem.Longitude = -43.0;

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.GeoFence);
    }

    // --- UnknownDevice ---

    [Fact]
    public async Task DetectAsync_UnknownDevice_FlagsUnknownDevice()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.DeviceId = "totally-new-device-xyz";

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.UnknownDevice);
    }

    [Fact]
    public async Task DetectAsync_KnownDevice_NoUnknownDeviceFlag()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.DeviceId = "known-device-001";

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.UnknownDevice);
    }

    [Fact]
    public async Task DetectAsync_FirstTimeUser_NoUnknownDeviceFlag()
    {
        // Arrange: user with no device history
        _attendanceRepoMock
            .Setup(x => x.GetKnownDeviceIdsAsync(TestUserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Enumerable.Empty<string>());

        var eventItem = CreateValidEvent();
        eventItem.DeviceId = "brand-new-device";

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.UnknownDevice);
    }

    // --- NoBiometric ---

    [Fact]
    public async Task DetectAsync_NoBiometric_FlagsNoBiometric()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.BiometricValidated = false;

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.NoBiometric);
    }

    [Fact]
    public async Task DetectAsync_BiometricValidated_NoNoBiometricFlag()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.BiometricValidated = true;

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.NoBiometric);
    }

    // --- OutdatedApp ---

    [Fact]
    public async Task DetectAsync_OutdatedApp_FlagsOutdatedApp()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.AppVersion = "0.9.0"; // Below minimum 1.0.0

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.OutdatedApp);
    }

    [Fact]
    public async Task DetectAsync_CurrentApp_NoOutdatedAppFlag()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.AppVersion = "2.0.0";

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.OutdatedApp);
    }

    [Fact]
    public async Task DetectAsync_EmptyAppVersion_FlagsOutdatedApp()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.AppVersion = "";

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.OutdatedApp);
    }

    // --- ReplayAttack ---

    [Fact]
    public async Task DetectAsync_ReplayAttack_FlagsReplayAttack()
    {
        // Arrange: counter exceeds threshold (4 > 3)
        _lockServiceMock
            .Setup(x => x.IncrementCounterAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(4);

        var eventItem = CreateValidEvent();

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.ReplayAttack);
    }

    [Fact]
    public async Task DetectAsync_FirstSubmission_NoReplayAttackFlag()
    {
        // Arrange: counter is 1 (first time)
        _lockServiceMock
            .Setup(x => x.IncrementCounterAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        var eventItem = CreateValidEvent();

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.ReplayAttack);
    }

    [Fact]
    public async Task DetectAsync_RedisUnavailable_NoReplayAttackFlag()
    {
        // Arrange: counter returns 0 (Redis unavailable, fail-open)
        _lockServiceMock
            .Setup(x => x.IncrementCounterAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);

        var eventItem = CreateValidEvent();

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.ReplayAttack);
    }

    // --- Multiple flags ---

    [Fact]
    public async Task DetectAsync_MultipleViolations_ReturnsAllFlags()
    {
        // Arrange: event with multiple fraud signals
        var eventItem = CreateValidEvent();
        eventItem.LocalDateTime = DateTime.UtcNow.AddHours(-50); // Stale
        eventItem.BiometricValidated = false;                     // No biometric
        eventItem.AppVersion = "0.5.0";                           // Outdated
        eventItem.DeviceId = "unknown-device";                    // Unknown device
        eventItem.Latitude = -22.9068;                            // Far from clinic
        eventItem.Longitude = -43.1729;

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.StaleEvent);
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.NoBiometric);
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.OutdatedApp);
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.UnknownDevice);
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.GeoFence);
    }

    // --- Integration with sync service: flags result in RequiresReview ---

    [Fact]
    public async Task DetectAsync_FlagsHaveDescriptions()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.BiometricValidated = false;

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        var biometricFlag = flags.Single(f => f.Code == AntiFraudFlagCode.NoBiometric);
        biometricFlag.Description.Should().NotBeNullOrWhiteSpace();
        biometricFlag.Description.Should().Contain("Biometria");
    }

    // --- Version parsing edge cases ---

    [Fact]
    public async Task DetectAsync_AppVersionWithVPrefix_ParsesCorrectly()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.AppVersion = "v2.0.0"; // With leading 'v'

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.OutdatedApp);
    }

    [Fact]
    public async Task DetectAsync_AppVersionTwoParts_ParsesCorrectly()
    {
        // Arrange
        var eventItem = CreateValidEvent();
        eventItem.AppVersion = "0.9"; // Below 1.0.0

        // Act
        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        // Assert
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.OutdatedApp);
    }

    // --- Haversine distance (tested indirectly through GeoFence check) ---

    [Fact]
    public async Task DetectAsync_SameLocation_NoGeoFenceFlag()
    {
        // Tests Haversine: same point = 0 distance
        var eventItem = CreateValidEvent();
        eventItem.Latitude = -23.5505;
        eventItem.Longitude = -46.6333;

        var flags = await _detector.DetectAsync(eventItem, TestUserId);
        flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.GeoFence);
    }

    [Fact]
    public async Task DetectAsync_FarLocation_FlagsGeoFence()
    {
        // Tests Haversine: São Paulo to Rio ~ 360km, well beyond 500m radius
        var eventItem = CreateValidEvent();
        eventItem.Latitude = -22.9068;
        eventItem.Longitude = -43.1729;

        var flags = await _detector.DetectAsync(eventItem, TestUserId);
        flags.Should().Contain(f => f.Code == AntiFraudFlagCode.GeoFence);
    }

    // --- TryParseVersion (tested indirectly through OutdatedApp check) ---

    [Theory]
    [InlineData("1.0.0", false)]  // Exact min version - not flagged
    [InlineData("v1.0.0", false)] // With 'v' prefix
    [InlineData("V2.3.4", false)] // With 'V' prefix, above min
    [InlineData("1.0", true)]     // Two-part, .NET treats "1.0" < "1.0.0"
    [InlineData("0.9.0", true)]   // Below min
    [InlineData("", true)]        // Empty - flagged
    public async Task DetectAsync_VersionParsing_FlagsCorrectly(string appVersion, bool shouldFlag)
    {
        var eventItem = CreateValidEvent();
        eventItem.AppVersion = appVersion;

        var flags = await _detector.DetectAsync(eventItem, TestUserId);

        if (shouldFlag)
            flags.Should().Contain(f => f.Code == AntiFraudFlagCode.OutdatedApp);
        else
            flags.Should().NotContain(f => f.Code == AntiFraudFlagCode.OutdatedApp);
    }
}
