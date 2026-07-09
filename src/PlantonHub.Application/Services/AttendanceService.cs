using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class AttendanceService : IAttendanceService
{
    private readonly IAttendanceRepository _attendanceRepository;
    private readonly IShiftRepository _shiftRepository;
    private readonly ITenantService _tenantService;

    public AttendanceService(
        IAttendanceRepository attendanceRepository,
        IShiftRepository shiftRepository,
        ITenantService tenantService)
    {
        _attendanceRepository = attendanceRepository;
        _shiftRepository = shiftRepository;
        _tenantService = tenantService;
    }

    public async Task<AttendanceResponse> CheckInAsync(CheckInRequest request)
    {
        var userId = _tenantService.GetCurrentUserId()
            ?? throw new UnauthorizedException("User not authenticated.");

        var clinicId = _tenantService.GetCurrentClinicId()
            ?? throw new UnauthorizedException("No active clinic context.");

        // Validate user is assigned to the shift
        var isAssigned = await _shiftRepository.AssignmentExistsAsync(request.ShiftId, userId);
        if (!isAssigned)
        {
            throw new ForbiddenException("Profissional não está atribuído a este plantão.");
        }

        // Validate no duplicate check-in (active check-in without check-out)
        var hasActiveCheckIn = await _attendanceRepository.HasActiveCheckInAsync(userId, request.ShiftId);
        if (hasActiveCheckIn)
        {
            throw new ConflictException("Já existe um check-in ativo para este plantão.");
        }

        var attendance = new Attendance
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ShiftId = request.ShiftId,
            ClinicId = clinicId,
            CheckInTime = DateTime.UtcNow,
            CheckInLatitude = request.Latitude,
            CheckInLongitude = request.Longitude,
            CheckInDeviceId = request.DeviceId,
            BiometricValidated = request.BiometricValidated
        };

        await _attendanceRepository.AddAsync(attendance);

        return MapToResponse(attendance);
    }

    public async Task<AttendanceResponse> CheckOutAsync(CheckOutRequest request)
    {
        var userId = _tenantService.GetCurrentUserId()
            ?? throw new UnauthorizedException("User not authenticated.");

        // Validate user is assigned to the shift
        var isAssigned = await _shiftRepository.AssignmentExistsAsync(request.ShiftId, userId);
        if (!isAssigned)
        {
            throw new ForbiddenException("Profissional não está atribuído a este plantão.");
        }

        // Validate active check-in exists
        var attendance = await _attendanceRepository.GetByUserAndShiftAsync(userId, request.ShiftId);
        if (attendance is null || attendance.CheckOutTime is not null)
        {
            throw new BadRequestException("Não existe check-in ativo para este plantão.");
        }

        // Update with check-out data without altering check-in data
        attendance.CheckOutTime = DateTime.UtcNow;
        attendance.CheckOutLatitude = request.Latitude;
        attendance.CheckOutLongitude = request.Longitude;
        attendance.CheckOutDeviceId = request.DeviceId;

        await _attendanceRepository.UpdateAsync(attendance);

        return MapToResponse(attendance);
    }

    public async Task<IEnumerable<AttendanceResponse>> GetMyHistoryAsync()
    {
        var userId = _tenantService.GetCurrentUserId()
            ?? throw new UnauthorizedException("User not authenticated.");

        var clinicId = _tenantService.GetCurrentClinicId()
            ?? throw new UnauthorizedException("No active clinic context.");

        var records = await _attendanceRepository.GetHistoryByUserAndClinicAsync(userId, clinicId);

        // Return ordered by date descending (most recent first)
        return records
            .OrderByDescending(a => a.CheckInTime)
            .Select(MapToResponse);
    }

    private static AttendanceResponse MapToResponse(Attendance attendance)
    {
        return new AttendanceResponse
        {
            Id = attendance.Id,
            UserId = attendance.UserId,
            ShiftId = attendance.ShiftId,
            ClinicId = attendance.ClinicId,
            CheckInTime = attendance.CheckInTime,
            CheckInLatitude = attendance.CheckInLatitude,
            CheckInLongitude = attendance.CheckInLongitude,
            CheckInDeviceId = attendance.CheckInDeviceId,
            BiometricValidated = attendance.BiometricValidated,
            CheckOutTime = attendance.CheckOutTime,
            CheckOutLatitude = attendance.CheckOutLatitude,
            CheckOutLongitude = attendance.CheckOutLongitude,
            CheckOutDeviceId = attendance.CheckOutDeviceId
        };
    }
}
