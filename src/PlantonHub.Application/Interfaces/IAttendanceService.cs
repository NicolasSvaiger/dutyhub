using PlantonHub.Application.DTOs.Attendance;

namespace PlantonHub.Application.Interfaces;

public interface IAttendanceService
{
    Task<AttendanceResponse> CheckInAsync(CheckInRequest request);
    Task<AttendanceResponse> CheckOutAsync(CheckOutRequest request);
    Task<IEnumerable<AttendanceResponse>> GetMyHistoryAsync();
}
