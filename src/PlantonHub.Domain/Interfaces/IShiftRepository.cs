using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IShiftRepository
{
    Task<Shift?> GetByIdAsync(Guid id);
    Task<IEnumerable<Shift>> GetAllAsync();
    Task<IEnumerable<Shift>> GetByClinicIdAsync(Guid clinicId);
    Task<IEnumerable<Shift>> GetByUserIdAsync(Guid userId);
    Task AddAsync(Shift shift);
    Task AddAssignmentAsync(ShiftAssignment assignment);
    Task<bool> AssignmentExistsAsync(Guid shiftId, Guid userId);
    Task DeleteAsync(Shift shift);

    /// <summary>
    /// Returns true if the user already has an assignment that overlaps with the
    /// given shift's date + time range (cross-clinic conflict detection).
    /// </summary>
    Task<bool> HasTimeOverlapForUserAsync(Guid userId, Guid excludeShiftId, DateTime date, TimeSpan startTime, TimeSpan endTime);
}
