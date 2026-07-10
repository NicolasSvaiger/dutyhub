using PlantonHub.Application.DTOs.Shifts;

namespace PlantonHub.Application.Interfaces;

public interface IShiftService
{
    Task<IEnumerable<ShiftResponse>> GetAllAsync();
    Task<ShiftResponse> CreateAsync(CreateShiftRequest request);
    Task AssignProfessionalAsync(Guid shiftId, AssignShiftRequest request);

    /// <summary>
    /// Returns the shifts assigned to the current user for TODAY at the active clinic.
    /// Used by the doctor check-in modal to know which shifts are eligible right now.
    /// </summary>
    Task<IEnumerable<ShiftResponse>> GetMyTodayShiftsAsync();

    /// <summary>
    /// Returns ALL shifts assigned to the current user across all authorized
    /// clinics. Used by the doctor shifts screen (past + today + upcoming).
    /// </summary>
    Task<IEnumerable<ShiftResponse>> GetMyShiftsAsync();
}
