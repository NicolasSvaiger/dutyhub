using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IAttendanceRepository
{
    Task<Attendance?> GetByIdAsync(Guid id);
    Task<Attendance?> GetByUserAndShiftAsync(Guid userId, Guid shiftId);
    Task<IEnumerable<Attendance>> GetHistoryByUserAndClinicAsync(Guid userId, Guid clinicId);
    Task AddAsync(Attendance attendance);
    Task UpdateAsync(Attendance attendance);
    Task<bool> HasActiveCheckInAsync(Guid userId, Guid shiftId);
    Task<bool> ExistsByLocalEventIdAsync(Guid localEventId, Guid userId, string deviceId);

    /// <summary>
    /// Returns the distinct DeviceIds previously used by the user for attendance events.
    /// Used for anti-fraud detection (unknown device check).
    /// </summary>
    Task<IEnumerable<string>> GetKnownDeviceIdsAsync(Guid userId, CancellationToken ct = default);
}
