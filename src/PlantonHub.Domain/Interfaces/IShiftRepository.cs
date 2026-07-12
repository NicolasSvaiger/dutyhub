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
}
