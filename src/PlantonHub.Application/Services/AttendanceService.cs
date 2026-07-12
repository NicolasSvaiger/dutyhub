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
    private readonly IClinicRepository _clinicRepository;
    private readonly ITenantService _tenantService;
    private readonly IFaceEnrollmentRepository _faceEnrollmentRepository;

    public AttendanceService(
        IAttendanceRepository attendanceRepository,
        IShiftRepository shiftRepository,
        IClinicRepository clinicRepository,
        ITenantService tenantService,
        IFaceEnrollmentRepository faceEnrollmentRepository)
    {
        _attendanceRepository = attendanceRepository;
        _shiftRepository = shiftRepository;
        _clinicRepository = clinicRepository;
        _tenantService = tenantService;
        _faceEnrollmentRepository = faceEnrollmentRepository;
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

        // Rule: professional can only be on one shift at a time. Block if there's
        // ANY active check-in (any shift, any clinic) that hasn't been closed.
        var hasAnyActive = await _attendanceRepository.HasAnyActiveCheckInAsync(userId);
        if (hasAnyActive)
        {
            // Enriquece o 409 com os dados do check-in ativo — o frontend não
            // precisa fazer um GET extra pra mostrar a mensagem de bloqueio.
            ActiveAttendanceInfo? activeInfo = null;
            foreach (var cId in _tenantService.GetAuthorizedClinicIds())
            {
                var actives = await _attendanceRepository.GetActiveByUserAndClinicAsync(userId, cId);
                var first = actives.FirstOrDefault();
                if (first is not null)
                {
                    var clinic = await _clinicRepository.GetByIdAsync(first.ClinicId);
                    activeInfo = new ActiveAttendanceInfo
                    {
                        Id = first.Id,
                        ShiftId = first.ShiftId,
                        ClinicId = first.ClinicId,
                        ClinicName = clinic?.Name ?? "Unidade",
                        CheckInTime = first.CheckInTime,
                    };
                    break;
                }
            }

            throw new ConflictException(
                "Você já tem um plantão em andamento. Finalize-o antes de iniciar um novo.",
                new Dictionary<string, object>
                {
                    ["code"] = "ACTIVE_CHECKIN_EXISTS",
                    ["activeAttendance"] = activeInfo!,
                });
        }

        // Server-side biometric enforcement: if the user has an active face enrollment,
        // the client MUST have performed face verification before check-in.
        // This prevents the app from being tampered to skip the biometric step.
        if (!request.BiometricValidated)
        {
            var hasEnrollment = await _faceEnrollmentRepository.HasEnrollmentAsync(userId);
            if (hasEnrollment)
            {
                throw new BadRequestException(
                    "Verificação biométrica obrigatória. Realize a verificação facial antes do check-in.");
            }
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

    public async Task<IEnumerable<AttendanceResponse>> GetMyActiveAsync()
    {
        var userId = _tenantService.GetCurrentUserId()
            ?? throw new UnauthorizedException("User not authenticated.");

        // Active check-ins can exist in ANY clinic the professional works in
        // (multi-clinic scenario: e.g., doctor checked in at Alpha earlier, then
        // opened check-out while the header is on Beta). The check-out modal
        // needs to see all of them regardless of the current active clinic.
        var authorizedClinicIds = _tenantService.GetAuthorizedClinicIds().ToList();
        if (authorizedClinicIds.Count == 0)
        {
            return Enumerable.Empty<AttendanceResponse>();
        }

        var result = new List<AttendanceResponse>();
        foreach (var clinicId in authorizedClinicIds)
        {
            var records = await _attendanceRepository.GetActiveByUserAndClinicAsync(userId, clinicId);
            result.AddRange(records.Select(MapToResponse));
        }

        return result;
    }

    public async Task<IEnumerable<AttendanceResponse>> GetMyHistoryAsync()
    {
        var userId = _tenantService.GetCurrentUserId()
            ?? throw new UnauthorizedException("User not authenticated.");

        // O histórico do profissional agrega TODAS as clínicas em que ele
        // trabalha, não apenas a ativa no header. Motivo: a tela "Presença"
        // e os relatórios do médico multi-clinic ficavam confusos ao mostrar
        // "sem check-in" quando, na verdade, havia check-in feito em outra
        // clínica que o usuário podia acessar.
        //
        // Se o chamador precisar filtrar por clínica específica, ele pode
        // fazer isso no cliente ou usar um endpoint específico no futuro.
        var authorizedClinicIds = _tenantService.GetAuthorizedClinicIds().ToList();
        if (authorizedClinicIds.Count == 0)
        {
            return Enumerable.Empty<AttendanceResponse>();
        }

        var all = new List<Attendance>();
        foreach (var clinicId in authorizedClinicIds)
        {
            var records = await _attendanceRepository.GetHistoryByUserAndClinicAsync(userId, clinicId);
            all.AddRange(records);
        }

        return all
            .OrderByDescending(a => a.CheckInTime)
            .Select(MapToResponse);
    }

    /// <summary>
    /// Endpoint unificado: retorna o "estado atual" do profissional logado em
    /// relação a check-in/check-out. Agrega toda a lógica num só lugar:
    ///   - Verifica se tem check-in ativo (qualquer clínica autorizada)
    ///   - Lista shifts de hoje da clínica ativa
    ///   - Decide canCheckIn/canCheckOut
    /// O frontend chama isso UMA vez e renderiza condicionalmente — zero decisões client-side.
    /// </summary>
    public async Task<AttendanceStatusResponse> GetStatusAsync()
    {
        var userId = _tenantService.GetCurrentUserId()
            ?? throw new UnauthorizedException("User not authenticated.");

        var clinicId = _tenantService.GetCurrentClinicId();
        var authorizedClinicIds = _tenantService.GetAuthorizedClinicIds().ToList();

        // 1. Verifica check-in ativo em QUALQUER clínica autorizada
        Attendance? activeAttendance = null;
        foreach (var cId in authorizedClinicIds)
        {
            var actives = await _attendanceRepository.GetActiveByUserAndClinicAsync(userId, cId);
            var first = actives.FirstOrDefault();
            if (first is not null)
            {
                activeAttendance = first;
                break;
            }
        }

        var hasActive = activeAttendance is not null;

        // 2. Busca shifts de hoje na clínica ativa (pra check-in)
        var availableShifts = new List<AvailableShiftInfo>();
        if (!hasActive && clinicId.HasValue)
        {
            var today = DateTime.UtcNow.Date;
            var userShifts = await _shiftRepository.GetByUserIdAsync(userId);
            availableShifts = userShifts
                .Where(s => s.ClinicId == clinicId.Value && s.Date.Date == today)
                .OrderBy(s => s.StartTime)
                .Select(s => new AvailableShiftInfo
                {
                    ShiftId = s.Id,
                    ClinicId = s.ClinicId,
                    Title = s.Title,
                    StartTime = s.StartTime,
                    EndTime = s.EndTime,
                })
                .ToList();
        }

        // 3. Resolve nome da clínica do check-in ativo (pra exibir no bloqueio)
        ActiveAttendanceInfo? activeInfo = null;
        if (activeAttendance is not null)
        {
            var clinic = await _clinicRepository.GetByIdAsync(activeAttendance.ClinicId);
            activeInfo = new ActiveAttendanceInfo
            {
                Id = activeAttendance.Id,
                ShiftId = activeAttendance.ShiftId,
                ClinicId = activeAttendance.ClinicId,
                ClinicName = clinic?.Name ?? "Unidade",
                CheckInTime = activeAttendance.CheckInTime,
            };
        }

        return new AttendanceStatusResponse
        {
            HasActiveCheckIn = hasActive,
            CanCheckIn = !hasActive && availableShifts.Count > 0,
            CanCheckOut = hasActive,
            ActiveAttendance = activeInfo,
            AvailableShiftsToday = availableShifts,
        };
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

    public async Task<AttendanceSummaryResponse> GetSummaryAsync(DateTime? from, DateTime? to)
    {
        var userId = _tenantService.GetCurrentUserId()
            ?? throw new UnauthorizedException("User not authenticated.");

        var authorizedClinicIds = _tenantService.GetAuthorizedClinicIds().ToList();
        if (authorizedClinicIds.Count == 0)
        {
            return new AttendanceSummaryResponse { FromDate = from, ToDate = to };
        }

        // Collect all attendance records across authorized clinics
        var allRecords = new List<Attendance>();
        foreach (var clinicId in authorizedClinicIds)
        {
            var records = await _attendanceRepository.GetHistoryByUserAndClinicAsync(userId, clinicId);
            allRecords.AddRange(records);
        }

        // Apply date filter
        var fromDate = from ?? DateTime.MinValue;
        var toDate = to ?? DateTime.MaxValue;

        var filtered = allRecords
            .Where(a => a.CheckInTime >= fromDate && a.CheckInTime <= toDate)
            .ToList();

        // Calculate metrics
        var totalDaysWorked = filtered
            .Select(a => a.CheckInTime.Date)
            .Distinct()
            .Count();

        var completedShifts = filtered.Where(a => a.CheckOutTime.HasValue).ToList();
        var totalHours = completedShifts
            .Sum(a => (a.CheckOutTime!.Value - a.CheckInTime).TotalHours);

        // Count absences: assigned shifts with no attendance in the period
        var userShifts = await _shiftRepository.GetByUserIdAsync(userId);
        var shiftsInPeriod = userShifts
            .Where(s => s.Date >= fromDate && s.Date <= toDate)
            .ToList();

        var attendedShiftIds = filtered.Select(a => a.ShiftId).ToHashSet();
        var absences = shiftsInPeriod.Count(s => !attendedShiftIds.Contains(s.Id));

        var avgHoursPerDay = totalDaysWorked > 0 ? totalHours / totalDaysWorked : 0;

        return new AttendanceSummaryResponse
        {
            TotalDaysWorked = totalDaysWorked,
            TotalHoursWorked = Math.Round(totalHours, 2),
            TotalAbsences = absences,
            TotalShiftsAssigned = shiftsInPeriod.Count,
            AverageHoursPerDay = Math.Round(avgHoursPerDay, 2),
            FromDate = from,
            ToDate = to,
        };
    }
}
