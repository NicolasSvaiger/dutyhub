namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Represents a single offline attendance event sent by the client for synchronization.
/// </summary>
public class OfflineEventSyncItem
{
    /// <summary>
    /// UUID generated on the device at event creation (used for idempotency).
    /// </summary>
    public Guid LocalEventId { get; set; }

    /// <summary>
    /// ID of the clinic where the attendance occurred.
    /// </summary>
    public Guid ClinicId { get; set; }

    /// <summary>
    /// ID of the shift associated with this attendance.
    /// </summary>
    public Guid ShiftId { get; set; }

    /// <summary>
    /// Type of attendance event: "CheckIn" or "CheckOut".
    /// </summary>
    public string AttendanceType { get; set; } = string.Empty;

    /// <summary>
    /// Local date/time of the device when the event occurred (ISO 8601).
    /// </summary>
    public DateTime LocalDateTime { get; set; }

    /// <summary>
    /// GPS latitude of the device.
    /// </summary>
    public double Latitude { get; set; }

    /// <summary>
    /// GPS longitude of the device.
    /// </summary>
    public double Longitude { get; set; }

    /// <summary>
    /// Unique identifier of the device.
    /// </summary>
    public string DeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Version of the app that created this event.
    /// </summary>
    public string AppVersion { get; set; } = string.Empty;

    /// <summary>
    /// Whether biometric validation was performed on the device.
    /// </summary>
    public bool BiometricValidated { get; set; }
}
