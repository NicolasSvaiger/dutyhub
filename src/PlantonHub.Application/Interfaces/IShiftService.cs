using PlantonHub.Application.DTOs.Shifts;

namespace PlantonHub.Application.Interfaces;

public interface IShiftService
{
    Task<IEnumerable<ShiftResponse>> GetAllAsync();
    Task<ShiftResponse> CreateAsync(CreateShiftRequest request);
    Task AssignProfessionalAsync(Guid shiftId, AssignShiftRequest request);
}
