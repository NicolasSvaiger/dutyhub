using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

/// <summary>
/// Records every offline attendance event received by the sync endpoint.
/// Serves as an audit trail and the source of truth for idempotency checks.
/// The unique index on (LocalEventId, UserId, DeviceId) prevents duplicate processing.
/// </summary>
public class OfflineAttendanceEvent
{
    public Guid OfflineAttendanceEventId { get; set; }

    /// <summary>
    /// UUID generated on the device at event creation (client-side idempotency key).
    /// </summary>
    public Guid LocalEventId { get; set; }

    public Guid UserId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid ShiftId { get; set; }

    /// <summary>
    /// "CheckIn" or "CheckOut".
    /// </summary>
    public string AttendanceType { get; set; } = string.Empty;

    /// <summary>
    /// Local date/time of the device when the event occurred.
    /// </summary>
    public DateTime LocalDateTime { get; set; }

    /// <summary>
    /// Server timestamp when this event was received.
    /// </summary>
    public DateTime ReceivedAtServer { get; set; }

    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string DeviceId { get; set; } = string.Empty;
    public string AppVersion { get; set; } = string.Empty;
    public bool BiometricValidated { get; set; }

    public SyncStatus SyncStatus { get; set; }
    public ValidationStatus ValidationStatus { get; set; }

    /// <summary>
    /// JSON-serialized array of validation messages (e.g., '["Location out of range","Clock skew detected"]').
    /// </summary>
    public string? ValidationMessages { get; set; }

    public bool IsDuplicate { get; set; }
    public bool RequiresReview { get; set; }

    /// <summary>
    /// JSON-serialized array of anti-fraud flag codes detected during processing.
    /// Stored as a string for database compatibility (e.g., '["StaleEvent","UnknownDevice"]').
    /// </summary>
    public string? AntiFraudFlags { get; set; }

    public DateTime CreatedAt { get; set; }

    // Navigation properties
    public User User { get; set; } = null!;
    public Clinic Clinic { get; set; } = null!;
    public Shift Shift { get; set; } = null!;
}
