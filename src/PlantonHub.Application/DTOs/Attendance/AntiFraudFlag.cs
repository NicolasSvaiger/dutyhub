namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Represents a specific anti-fraud condition detected during offline event validation.
/// Each flag has a programmatic code and a human-readable description.
/// </summary>
public class AntiFraudFlag
{
    /// <summary>
    /// Programmatic code identifying the type of fraud signal.
    /// </summary>
    public AntiFraudFlagCode Code { get; set; }

    /// <summary>
    /// Human-readable description of the detected condition.
    /// </summary>
    public string Description { get; set; } = string.Empty;

    public AntiFraudFlag(AntiFraudFlagCode code, string description)
    {
        Code = code;
        Description = description;
    }
}

/// <summary>
/// Programmatic codes for anti-fraud flag types.
/// Used for structured detection and automated processing.
/// </summary>
public enum AntiFraudFlagCode
{
    /// <summary>
    /// Event LocalDateTime is too old (exceeds configured stale threshold).
    /// </summary>
    StaleEvent,

    /// <summary>
    /// Significant difference between device local time and server time.
    /// </summary>
    ClockSkew,

    /// <summary>
    /// Event location is outside the allowed radius of the clinic.
    /// </summary>
    GeoFence,

    /// <summary>
    /// DeviceId is different from the user's previously known devices.
    /// </summary>
    UnknownDevice,

    /// <summary>
    /// Biometric validation was not performed on the device.
    /// </summary>
    NoBiometric,

    /// <summary>
    /// App version is below the minimum required version.
    /// </summary>
    OutdatedApp,

    /// <summary>
    /// Multiple rapid re-submissions of the same event detected (possible replay attack).
    /// </summary>
    ReplayAttack
}
