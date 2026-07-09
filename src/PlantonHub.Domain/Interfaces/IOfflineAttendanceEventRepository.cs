using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

/// <summary>
/// Repository for persisting offline attendance events received via sync endpoint.
/// </summary>
public interface IOfflineAttendanceEventRepository
{
    /// <summary>
    /// Saves an offline attendance event record.
    /// </summary>
    Task AddAsync(OfflineAttendanceEvent offlineEvent);

    /// <summary>
    /// Checks if an event with the same (LocalEventId, UserId, DeviceId) already exists.
    /// This is the definitive idempotency check (source of truth in PostgreSQL).
    /// </summary>
    Task<bool> ExistsAsync(Guid localEventId, Guid userId, string deviceId);
}
