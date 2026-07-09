using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Service responsible for logging audit records for each offline sync event processed.
/// Captures full context: identity, timing, device metadata, location, and validation result.
/// </summary>
public interface IOfflineSyncAuditService
{
    /// <summary>
    /// Logs an audit record for a processed offline sync event.
    /// </summary>
    /// <param name="eventItem">The original offline event data.</param>
    /// <param name="userId">The authenticated user who submitted the sync.</param>
    /// <param name="syncStatus">The final sync status assigned to the event.</param>
    /// <param name="rejectionOrReviewReason">Reason for rejection or review, if applicable.</param>
    Task LogSyncEventAsync(
        OfflineEventSyncItem eventItem,
        Guid userId,
        SyncStatus syncStatus,
        string? rejectionOrReviewReason = null);
}
