using PlantonHub.Application.DTOs.Attendance;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Service for handling batch synchronization of offline attendance events.
/// </summary>
public interface IAttendanceSyncService
{
    /// <summary>
    /// Processes a batch of offline attendance events for the authenticated user.
    /// Each event is processed individually and idempotency is guaranteed via (LocalEventId, UserId, DeviceId).
    /// </summary>
    Task<SyncResponse> SyncOfflineEventsAsync(OfflineEventSyncRequest request);
}
