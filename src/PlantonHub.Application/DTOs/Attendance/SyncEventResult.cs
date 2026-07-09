using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Result of synchronizing a single offline attendance event.
/// </summary>
public class SyncEventResult
{
    /// <summary>
    /// The LocalEventId from the original request (for client correlation).
    /// </summary>
    public Guid LocalEventId { get; set; }

    /// <summary>
    /// Sync status assigned to this event.
    /// </summary>
    public SyncStatus Status { get; set; }

    /// <summary>
    /// Human-readable message describing the result.
    /// </summary>
    public string Message { get; set; } = string.Empty;

    /// <summary>
    /// The Attendance ID if the event was successfully synced. Null if rejected or duplicate.
    /// </summary>
    public Guid? AttendanceId { get; set; }
}
