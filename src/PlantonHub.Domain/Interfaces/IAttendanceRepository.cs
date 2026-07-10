using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IAttendanceRepository
{
    Task<Attendance?> GetByIdAsync(Guid id);
    Task<Attendance?> GetByUserAndShiftAsync(Guid userId, Guid shiftId);
    Task<IEnumerable<Attendance>> GetHistoryByUserAndClinicAsync(Guid userId, Guid clinicId);

    /// <summary>
    /// Returns attendances of the user in a clinic that don't have a check-out yet
    /// (i.e., active check-ins that are still open).
    /// </summary>
    Task<IEnumerable<Attendance>> GetActiveByUserAndClinicAsync(Guid userId, Guid clinicId);
    Task AddAsync(Attendance attendance);
    Task UpdateAsync(Attendance attendance);
    Task<bool> HasActiveCheckInAsync(Guid userId, Guid shiftId);

    /// <summary>
    /// Returns true if the user has ANY active check-in (no check-out) across
    /// all shifts/clinics. Enforces the rule that a professional can only be
    /// on one shift at a time.
    /// </summary>
    Task<bool> HasAnyActiveCheckInAsync(Guid userId);
    Task<bool> ExistsByLocalEventIdAsync(Guid localEventId, Guid userId, string deviceId);

    /// <summary>
    /// Returns the distinct DeviceIds previously used by the user for attendance events.
    /// Used for anti-fraud detection (unknown device check).
    /// </summary>
    Task<IEnumerable<string>> GetKnownDeviceIdsAsync(Guid userId, CancellationToken ct = default);
}
