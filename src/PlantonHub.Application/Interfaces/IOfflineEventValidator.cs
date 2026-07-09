using PlantonHub.Application.DTOs.Attendance;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Validates offline attendance events before processing.
/// Checks user-clinic membership, shift assignment, temporal order,
/// geolocation, biometric validation, and clock skew.
/// </summary>
public interface IOfflineEventValidator
{
    /// <summary>
    /// Validates an offline event against business rules.
    /// Returns a result indicating whether the event should be accepted, flagged, or rejected.
    /// </summary>
    /// <param name="eventItem">The offline event to validate.</param>
    /// <param name="userId">The authenticated user ID submitting the event.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Validation result with outcome and messages.</returns>
    Task<OfflineEventValidationResult> ValidateAsync(
        OfflineEventSyncItem eventItem,
        Guid userId,
        CancellationToken ct = default);
}
