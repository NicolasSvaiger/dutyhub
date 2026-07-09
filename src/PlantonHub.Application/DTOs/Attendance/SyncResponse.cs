namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Response for batch synchronization of offline attendance events.
/// </summary>
public class SyncResponse
{
    /// <summary>
    /// Total number of events received.
    /// </summary>
    public int TotalReceived { get; set; }

    /// <summary>
    /// Number of events successfully synced.
    /// </summary>
    public int Synced { get; set; }

    /// <summary>
    /// Number of duplicate events ignored.
    /// </summary>
    public int Duplicates { get; set; }

    /// <summary>
    /// Number of events rejected due to validation failures.
    /// </summary>
    public int Rejected { get; set; }

    /// <summary>
    /// Number of events that require manual review.
    /// </summary>
    public int RequiresReview { get; set; }

    /// <summary>
    /// Per-event results with status and messages.
    /// </summary>
    public List<SyncEventResult> Results { get; set; } = new();
}
