using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

/// <summary>
/// Audit log entry for each offline attendance event processed by the sync endpoint.
/// Records full metadata including user, device, location, timing, and validation results.
/// </summary>
public class OfflineSyncAuditLog
{
    public Guid Id { get; set; }

    // --- Identity ---
    public Guid UserId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid ShiftId { get; set; }

    /// <summary>
    /// UUID generated on the device (correlates with OfflineAttendanceEvent).
    /// </summary>
    public Guid LocalEventId { get; set; }

    // --- Timing ---

    /// <summary>
    /// Local date/time from the device when the event occurred.
    /// </summary>
    public DateTime LocalDateTime { get; set; }

    /// <summary>
    /// Timestamp when the server received and processed this event.
    /// </summary>
    public DateTime ReceivedAtServer { get; set; }

    // --- Device/Request Metadata ---
    public string DeviceId { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }

    // --- Location ---
    public double Latitude { get; set; }
    public double Longitude { get; set; }

    // --- Validation Result ---

    /// <summary>
    /// Outcome of the sync validation: Accepted, Rejected, or RequiresReview.
    /// </summary>
    public SyncAuditResult ValidationResult { get; set; }

    /// <summary>
    /// Reason for rejection or review requirement. Null when accepted without issues.
    /// </summary>
    public string? RejectionOrReviewReason { get; set; }

    public DateTime CreatedAt { get; set; }

    // Navigation properties
    public User User { get; set; } = null!;
    public Clinic Clinic { get; set; } = null!;
    public Shift Shift { get; set; } = null!;
}
