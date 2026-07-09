using Microsoft.Extensions.Options;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

/// <summary>
/// Detects anti-fraud conditions on offline attendance events.
/// Produces explicit flag codes for programmatic use.
/// Events with any flag result in RequiresReview status.
///
/// Flags detected:
/// - StaleEvent: event LocalDateTime exceeds configured stale threshold
/// - ClockSkew: significant time difference between device and server
/// - GeoFence: location outside the allowed radius of the clinic
/// - UnknownDevice: DeviceId not previously used by the user
/// - NoBiometric: biometric validation not performed on device
/// - OutdatedApp: AppVersion below the configured minimum
/// - ReplayAttack: multiple rapid re-submissions of the same event
/// </summary>
public class AntiFraudDetector : IAntiFraudDetector
{
    private readonly IAttendanceRepository _attendanceRepository;
    private readonly IClinicRepository _clinicRepository;
    private readonly IDistributedLockService _distributedLockService;
    private readonly AntiFraudSettings _settings;

    /// <summary>
    /// Earth's mean radius in meters (used for Haversine formula).
    /// </summary>
    private const double EarthRadiusMeters = 6_371_000.0;

    public AntiFraudDetector(
        IAttendanceRepository attendanceRepository,
        IClinicRepository clinicRepository,
        IDistributedLockService distributedLockService,
        IOptions<AntiFraudSettings> settings)
    {
        _attendanceRepository = attendanceRepository;
        _clinicRepository = clinicRepository;
        _distributedLockService = distributedLockService;
        _settings = settings.Value;
    }

    public async Task<List<AntiFraudFlag>> DetectAsync(
        OfflineEventSyncItem eventItem,
        Guid userId,
        CancellationToken ct = default)
    {
        var flags = new List<AntiFraudFlag>();

        // Run all checks — each adds a flag if the condition is detected
        CheckStaleEvent(eventItem, flags);
        CheckClockSkew(eventItem, flags);
        await CheckGeoFence(eventItem, flags, ct);
        await CheckUnknownDevice(eventItem, userId, flags, ct);
        CheckNoBiometric(eventItem, flags);
        CheckOutdatedApp(eventItem, flags);
        await CheckReplayAttack(eventItem, userId, flags, ct);

        return flags;
    }

    /// <summary>
    /// Checks if the event is too old (stale).
    /// Distinct from clock skew: this flags events where LocalDateTime is excessively old,
    /// regardless of the direction of the difference.
    /// </summary>
    private void CheckStaleEvent(OfflineEventSyncItem eventItem, List<AntiFraudFlag> flags)
    {
        var serverNow = DateTime.UtcNow;
        var age = serverNow - eventItem.LocalDateTime;

        if (age.TotalHours > _settings.StaleEventThresholdHours)
        {
            flags.Add(new AntiFraudFlag(
                AntiFraudFlagCode.StaleEvent,
                $"Evento offline muito antigo. Idade: {age.TotalHours:F1} horas (limite: {_settings.StaleEventThresholdHours} horas)."));
        }
    }

    /// <summary>
    /// Checks for significant clock skew between device and server.
    /// Flags events in the future beyond the configured threshold.
    /// </summary>
    private void CheckClockSkew(OfflineEventSyncItem eventItem, List<AntiFraudFlag> flags)
    {
        var serverNow = DateTime.UtcNow;
        var skew = serverNow - eventItem.LocalDateTime;

        // Event is in the future (device clock ahead)
        if (skew.TotalMinutes < -_settings.ClockSkewThresholdMinutes)
        {
            flags.Add(new AntiFraudFlag(
                AntiFraudFlagCode.ClockSkew,
                $"Relógio do dispositivo adiantado. Diferença: {Math.Abs(skew.TotalMinutes):F0} minutos no futuro."));
        }
    }

    /// <summary>
    /// Checks if the event location is outside the allowed radius of the clinic.
    /// </summary>
    private async Task CheckGeoFence(OfflineEventSyncItem eventItem, List<AntiFraudFlag> flags, CancellationToken ct)
    {
        var clinic = await _clinicRepository.GetByIdAsync(eventItem.ClinicId);

        if (clinic is null || clinic.Latitude is null || clinic.Longitude is null)
            return;

        var allowedRadius = clinic.AllowedRadiusMeters ?? 500.0;
        var distance = CalculateHaversineDistance(
            clinic.Latitude.Value, clinic.Longitude.Value,
            eventItem.Latitude, eventItem.Longitude);

        if (distance > allowedRadius)
        {
            flags.Add(new AntiFraudFlag(
                AntiFraudFlagCode.GeoFence,
                $"Localização fora do raio permitido. Distância: {distance:F0}m, Raio permitido: {allowedRadius:F0}m."));
        }
    }

    /// <summary>
    /// Checks if the DeviceId is different from the user's historically known devices.
    /// First-time users (no history) are not flagged.
    /// </summary>
    private async Task CheckUnknownDevice(
        OfflineEventSyncItem eventItem, Guid userId, List<AntiFraudFlag> flags, CancellationToken ct)
    {
        var knownDevices = await _attendanceRepository.GetKnownDeviceIdsAsync(userId, ct);
        var knownList = knownDevices.ToList();

        // If the user has no device history yet, don't flag (first-time user)
        if (knownList.Count == 0)
            return;

        if (!knownList.Contains(eventItem.DeviceId, StringComparer.OrdinalIgnoreCase))
        {
            flags.Add(new AntiFraudFlag(
                AntiFraudFlagCode.UnknownDevice,
                $"DeviceId '{eventItem.DeviceId}' não é reconhecido para este usuário."));
        }
    }

    /// <summary>
    /// Checks if biometric validation was not performed on the device.
    /// </summary>
    private static void CheckNoBiometric(OfflineEventSyncItem eventItem, List<AntiFraudFlag> flags)
    {
        if (!eventItem.BiometricValidated)
        {
            flags.Add(new AntiFraudFlag(
                AntiFraudFlagCode.NoBiometric,
                "Biometria não validada localmente no dispositivo."));
        }
    }

    /// <summary>
    /// Checks if the app version is below the minimum configured version.
    /// Uses semantic versioning comparison (major.minor.patch).
    /// </summary>
    private void CheckOutdatedApp(OfflineEventSyncItem eventItem, List<AntiFraudFlag> flags)
    {
        if (string.IsNullOrWhiteSpace(eventItem.AppVersion))
        {
            flags.Add(new AntiFraudFlag(
                AntiFraudFlagCode.OutdatedApp,
                "Versão do aplicativo não informada."));
            return;
        }

        if (!TryParseVersion(eventItem.AppVersion, out var appVersion))
            return;

        if (!TryParseVersion(_settings.MinimumAppVersion, out var minVersion))
            return;

        if (appVersion < minVersion)
        {
            flags.Add(new AntiFraudFlag(
                AntiFraudFlagCode.OutdatedApp,
                $"Versão do aplicativo ({eventItem.AppVersion}) está abaixo da versão mínima ({_settings.MinimumAppVersion})."));
        }
    }

    /// <summary>
    /// Checks for replay attacks by counting recent submissions of the same LocalEventId in Redis.
    /// Uses an incrementing counter with TTL window.
    /// </summary>
    private async Task CheckReplayAttack(
        OfflineEventSyncItem eventItem, Guid userId, List<AntiFraudFlag> flags, CancellationToken ct)
    {
        var replayKey = $"antifraud:replay:{eventItem.LocalEventId}:{userId}";
        var windowTtl = TimeSpan.FromMinutes(_settings.ReplayAttackWindowMinutes);

        var count = await _distributedLockService.IncrementCounterAsync(replayKey, windowTtl, ct);

        if (count > _settings.ReplayAttackThreshold)
        {
            flags.Add(new AntiFraudFlag(
                AntiFraudFlagCode.ReplayAttack,
                $"Múltiplas tentativas de envio do mesmo evento detectadas ({count} submissões em {_settings.ReplayAttackWindowMinutes} minutos)."));
        }
    }

    /// <summary>
    /// Calculates the distance in meters between two geographic coordinates using the Haversine formula.
    /// </summary>
    internal static double CalculateHaversineDistance(double lat1, double lon1, double lat2, double lon2)
    {
        var dLat = DegreesToRadians(lat2 - lat1);
        var dLon = DegreesToRadians(lon2 - lon1);

        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(DegreesToRadians(lat1)) * Math.Cos(DegreesToRadians(lat2)) *
                Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));

        return EarthRadiusMeters * c;
    }

    private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180.0;

    /// <summary>
    /// Tries to parse a version string in the format "major.minor.patch" or "major.minor".
    /// </summary>
    internal static bool TryParseVersion(string versionStr, out Version version)
    {
        version = null!;
        if (string.IsNullOrWhiteSpace(versionStr))
            return false;

        // Remove any leading 'v' or 'V'
        var normalized = versionStr.TrimStart('v', 'V');

        return Version.TryParse(normalized, out version!);
    }
}
