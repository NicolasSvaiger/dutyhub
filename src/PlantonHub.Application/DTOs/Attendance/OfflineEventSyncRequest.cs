namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Request body for batch synchronization of offline attendance events.
/// </summary>
public class OfflineEventSyncRequest
{
    /// <summary>
    /// List of offline events to synchronize.
    /// </summary>
    public List<OfflineEventSyncItem> Events { get; set; } = new();
}
