using PlantonHub.Application.DTOs.Attendance;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Detects anti-fraud conditions on offline attendance events.
/// Produces explicit flag codes for programmatic processing.
/// Events with any anti-fraud flag are escalated to RequiresReview.
/// </summary>
public interface IAntiFraudDetector
{
    /// <summary>
    /// Analyzes an offline event and returns a list of anti-fraud flags detected.
    /// </summary>
    /// <param name="eventItem">The offline event to analyze.</param>
    /// <param name="userId">The authenticated user submitting the event.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>List of anti-fraud flags (empty if no suspicious conditions found).</returns>
    Task<List<AntiFraudFlag>> DetectAsync(
        OfflineEventSyncItem eventItem,
        Guid userId,
        CancellationToken ct = default);
}
