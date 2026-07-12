namespace PlantonHub.Application.DTOs.Attendance;

public class CheckInRequest
{
    public Guid ShiftId { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string DeviceId { get; set; } = string.Empty;
    public bool BiometricValidated { get; set; }

    /// <summary>
    /// Server-issued proof token from POST /api/biometric/verify.
    /// Required when the user has an active face enrollment.
    /// Replaces trust in the client-supplied BiometricValidated flag.
    /// </summary>
    public string? BiometricProofToken { get; set; }
}
