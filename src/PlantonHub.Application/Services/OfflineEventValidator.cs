using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

/// <summary>
/// Validates offline attendance events before processing.
/// Performs the following checks:
/// 1. User belongs to the clinic (UserClinicRole exists)
/// 2. User is assigned to the shift
/// 3. Temporal order: CheckOut requires a prior CheckIn
/// 4. Geolocation: event is within allowed radius of the clinic
/// 5. Biometric: device-level biometric validation was confirmed
/// 6. Clock skew: event timestamp is not too far from server time
/// </summary>
public class OfflineEventValidator : IOfflineEventValidator
{
    private readonly IClinicRepository _clinicRepository;
    private readonly IShiftRepository _shiftRepository;
    private readonly IAttendanceRepository _attendanceRepository;

    /// <summary>
    /// Default allowed radius in meters when clinic does not have a configured value.
    /// </summary>
    public const double DefaultAllowedRadiusMeters = 500.0;

    /// <summary>
    /// Maximum allowed clock skew in hours for events in the past.
    /// Events older than this are flagged for review.
    /// </summary>
    public const double MaxClockSkewHours = 24.0;

    /// <summary>
    /// Earth's mean radius in meters (used for Haversine formula).
    /// </summary>
    private const double EarthRadiusMeters = 6_371_000.0;

    public OfflineEventValidator(
        IClinicRepository clinicRepository,
        IShiftRepository shiftRepository,
        IAttendanceRepository attendanceRepository)
    {
        _clinicRepository = clinicRepository;
        _shiftRepository = shiftRepository;
        _attendanceRepository = attendanceRepository;
    }

    public async Task<OfflineEventValidationResult> ValidateAsync(
        OfflineEventSyncItem eventItem,
        Guid userId,
        CancellationToken ct = default)
    {
        var result = new OfflineEventValidationResult();

        // 1. Validate user belongs to the clinic
        await ValidateUserClinicMembership(eventItem, userId, result);

        // If user doesn't belong to clinic, reject immediately (no point in further validation)
        if (result.IsRejected)
            return result;

        // 2. Validate user is assigned to the shift
        await ValidateShiftAssignment(eventItem, userId, result);

        if (result.IsRejected)
            return result;

        // 3. Validate temporal order (CheckOut requires prior CheckIn)
        if (eventItem.AttendanceType == "CheckOut")
        {
            await ValidateTemporalOrder(eventItem, userId, result);
        }

        // 4. Validate geolocation
        await ValidateGeolocation(eventItem, result);

        // 5. Validate biometric
        ValidateBiometric(eventItem, result);

        // 6. Validate clock skew
        ValidateClockSkew(eventItem, result);

        return result;
    }

    private async Task ValidateUserClinicMembership(
        OfflineEventSyncItem eventItem, Guid userId, OfflineEventValidationResult result)
    {
        var belongs = await _clinicRepository.UserBelongsToClinicAsync(userId, eventItem.ClinicId);
        if (!belongs)
        {
            result.Outcome = ValidationOutcome.Rejected;
            result.Messages.Add("Usuário não pertence à clínica informada.");
        }
    }

    private async Task ValidateShiftAssignment(
        OfflineEventSyncItem eventItem, Guid userId, OfflineEventValidationResult result)
    {
        var isAssigned = await _shiftRepository.AssignmentExistsAsync(eventItem.ShiftId, userId);
        if (!isAssigned)
        {
            result.Outcome = ValidationOutcome.Rejected;
            result.Messages.Add("Usuário não está vinculado ao plantão informado.");
        }
    }

    private async Task ValidateTemporalOrder(
        OfflineEventSyncItem eventItem, Guid userId, OfflineEventValidationResult result)
    {
        var attendance = await _attendanceRepository.GetByUserAndShiftAsync(userId, eventItem.ShiftId);

        if (attendance is null || attendance.CheckInTime == default)
        {
            result.Outcome = ValidationOutcome.Rejected;
            result.Messages.Add("Não existe check-in anterior para este plantão. Check-out requer check-in prévio.");
            return;
        }

        // Check-out time must be after check-in time
        if (eventItem.LocalDateTime <= attendance.CheckInTime)
        {
            result.Outcome = ValidationOutcome.Rejected;
            result.Messages.Add("Horário do check-out deve ser posterior ao horário do check-in.");
        }
    }

    private async Task ValidateGeolocation(
        OfflineEventSyncItem eventItem, OfflineEventValidationResult result)
    {
        var clinic = await _clinicRepository.GetByIdAsync(eventItem.ClinicId);

        if (clinic is null)
        {
            result.Outcome = ValidationOutcome.Rejected;
            result.Messages.Add("Clínica não encontrada.");
            return;
        }

        // If clinic doesn't have coordinates configured, skip geolocation validation
        if (clinic.Latitude is null || clinic.Longitude is null)
            return;

        var allowedRadius = clinic.AllowedRadiusMeters ?? DefaultAllowedRadiusMeters;
        var distance = CalculateHaversineDistance(
            clinic.Latitude.Value, clinic.Longitude.Value,
            eventItem.Latitude, eventItem.Longitude);

        if (distance > allowedRadius)
        {
            // Location outside allowed radius is a flag, not an immediate rejection
            EscalateToReview(result);
            result.Messages.Add(
                $"Localização fora do raio permitido da clínica. " +
                $"Distância: {distance:F0}m, Raio permitido: {allowedRadius:F0}m.");
        }
    }

    private static void ValidateBiometric(
        OfflineEventSyncItem eventItem, OfflineEventValidationResult result)
    {
        if (!eventItem.BiometricValidated)
        {
            EscalateToReview(result);
            result.Messages.Add("Biometria não foi validada localmente no dispositivo.");
        }
    }

    private static void ValidateClockSkew(
        OfflineEventSyncItem eventItem, OfflineEventValidationResult result)
    {
        var serverNow = DateTime.UtcNow;
        var skew = serverNow - eventItem.LocalDateTime;

        // Event in the future (device clock ahead of server)
        if (skew.TotalMinutes < -5)
        {
            EscalateToReview(result);
            result.Messages.Add(
                $"Horário do evento está no futuro em relação ao servidor. " +
                $"Diferença: {Math.Abs(skew.TotalMinutes):F0} minutos à frente.");
            return;
        }

        // Event too far in the past
        if (skew.TotalHours > MaxClockSkewHours)
        {
            EscalateToReview(result);
            result.Messages.Add(
                $"Diferença excessiva entre horário do dispositivo e servidor. " +
                $"Evento registrado há {skew.TotalHours:F1} horas.");
        }
    }

    /// <summary>
    /// Escalates the validation result to RequiresReview (if not already Rejected).
    /// </summary>
    private static void EscalateToReview(OfflineEventValidationResult result)
    {
        if (result.Outcome != ValidationOutcome.Rejected)
        {
            result.Outcome = ValidationOutcome.RequiresReview;
        }
    }

    /// <summary>
    /// Calculates the distance in meters between two geographic coordinates
    /// using the Haversine formula.
    /// </summary>
    /// <param name="lat1">Latitude of point 1 in degrees.</param>
    /// <param name="lon1">Longitude of point 1 in degrees.</param>
    /// <param name="lat2">Latitude of point 2 in degrees.</param>
    /// <param name="lon2">Longitude of point 2 in degrees.</param>
    /// <returns>Distance in meters.</returns>
    public static double CalculateHaversineDistance(double lat1, double lon1, double lat2, double lon2)
    {
        var dLat = DegreesToRadians(lat2 - lat1);
        var dLon = DegreesToRadians(lon2 - lon1);

        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(DegreesToRadians(lat1)) * Math.Cos(DegreesToRadians(lat2)) *
                Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));

        return EarthRadiusMeters * c;
    }

    private static double DegreesToRadians(double degrees)
    {
        return degrees * Math.PI / 180.0;
    }
}
