using PlantonHub.Application.Constants;
using PlantonHub.Application.DTOs.Shifts;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class ShiftService : IShiftService
{
    private readonly IShiftRepository _shiftRepository;
    private readonly IUserRepository _userRepository;
    private readonly ITenantService _tenantService;
    private readonly ICacheService _cacheService;

    public ShiftService(
        IShiftRepository shiftRepository,
        IUserRepository userRepository,
        ITenantService tenantService,
        ICacheService cacheService)
    {
        _shiftRepository = shiftRepository;
        _userRepository = userRepository;
        _tenantService = tenantService;
        _cacheService = cacheService;
    }

    public async Task<IEnumerable<ShiftResponse>> GetAllAsync()
    {
        if (_tenantService.IsAdminGlobal())
        {
            // AdminGlobal sees all shifts from all clinics (no cache — broad scope)
            var shifts = await _shiftRepository.GetAllAsync();
            return shifts.Select(MapToResponse);
        }

        var clinicId = _tenantService.GetCurrentClinicId();
        if (clinicId is null)
        {
            return Enumerable.Empty<ShiftResponse>();
        }

        var roles = _tenantService.GetCurrentRoles();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (isAdminClinica)
        {
            // AdminClinica sees all shifts from their clinic — cache by clinic
            var results = await _cacheService.GetOrSetAsync(
                CacheKeys.Shifts(clinicId.Value),
                async () =>
                {
                    var shifts = await _shiftRepository.GetByClinicIdAsync(clinicId.Value);
                    return shifts.Select(MapToResponse).ToList();
                });

            return results ?? Enumerable.Empty<ShiftResponse>();
        }
        else
        {
            // Professionals (Medico, Enfermeiro, Tecnico) see only assigned shifts — cache by user
            var userId = _tenantService.GetCurrentUserId();
            if (userId is null)
            {
                return Enumerable.Empty<ShiftResponse>();
            }

            var results = await _cacheService.GetOrSetAsync(
                CacheKeys.ShiftsUser(clinicId.Value, userId.Value),
                async () =>
                {
                    var userShifts = await _shiftRepository.GetByUserIdAsync(userId.Value);
                    return userShifts.Where(s => s.ClinicId == clinicId.Value)
                        .Select(MapToResponse).ToList();
                });

            return results ?? Enumerable.Empty<ShiftResponse>();
        }
    }

    public async Task<ShiftResponse> CreateAsync(CreateShiftRequest request)
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
        {
            throw new ForbiddenException("Only AdminClinica or AdminGlobal can create shifts.");
        }

        // If AdminClinica, verify the shift is being created in their own clinic
        if (isAdminClinica && !isAdminGlobal)
        {
            var currentClinicId = _tenantService.GetCurrentClinicId();
            if (currentClinicId is null || request.ClinicId != currentClinicId.Value)
            {
                throw new ForbiddenException("AdminClinica can only create shifts in their own clinic.");
            }
        }

        var shift = new Shift
        {
            Id = Guid.NewGuid(),
            ClinicId = request.ClinicId,
            Title = request.Title,
            Date = request.Date,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            CreatedAt = DateTime.UtcNow
        };

        await _shiftRepository.AddAsync(shift);

        // Invalidate all shift-related cache entries
        await _cacheService.RemoveByPrefixAsync("shifts:");

        return MapToResponse(shift);
    }

    public async Task<IEnumerable<ShiftResponse>> GetMyTodayShiftsAsync()
    {
        var userId = _tenantService.GetCurrentUserId();
        if (userId is null)
        {
            return Enumerable.Empty<ShiftResponse>();
        }

        var clinicId = _tenantService.GetCurrentClinicId();
        if (clinicId is null)
        {
            return Enumerable.Empty<ShiftResponse>();
        }

        var today = DateTime.UtcNow.Date;

        var userShifts = await _shiftRepository.GetByUserIdAsync(userId.Value);
        return userShifts
            .Where(s => s.ClinicId == clinicId.Value && s.Date.Date == today)
            .OrderBy(s => s.StartTime)
            .Select(MapToResponse);
    }

    public async Task<IEnumerable<ShiftResponse>> GetMyShiftsAsync()
    {
        var userId = _tenantService.GetCurrentUserId();
        if (userId is null)
        {
            return Enumerable.Empty<ShiftResponse>();
        }

        // All shifts across all authorized clinics — used by the "Plantões" screen
        var authorized = _tenantService.GetAuthorizedClinicIds().ToHashSet();
        var userShifts = await _shiftRepository.GetByUserIdAsync(userId.Value);

        return userShifts
            .Where(s => authorized.Count == 0 || authorized.Contains(s.ClinicId))
            .OrderByDescending(s => s.Date)
            .ThenBy(s => s.StartTime)
            .Select(MapToResponse);
    }

    public async Task AssignProfessionalAsync(Guid shiftId, AssignShiftRequest request)
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
        {
            throw new ForbiddenException("Only AdminClinica or AdminGlobal can assign professionals to shifts.");
        }

        var shift = await _shiftRepository.GetByIdAsync(shiftId);
        if (shift is null)
        {
            throw new NotFoundException($"Shift with id '{shiftId}' not found.");
        }

        // If AdminClinica, verify the shift belongs to their clinic
        if (isAdminClinica && !isAdminGlobal)
        {
            var currentClinicId = _tenantService.GetCurrentClinicId();
            if (currentClinicId is null || shift.ClinicId != currentClinicId.Value)
            {
                throw new ForbiddenException("AdminClinica can only assign professionals to shifts in their own clinic.");
            }
        }

        // Verify the user exists
        var user = await _userRepository.GetByIdAsync(request.UserId);
        if (user is null)
        {
            throw new NotFoundException($"User with id '{request.UserId}' not found.");
        }

        // Check if assignment already exists
        if (await _shiftRepository.AssignmentExistsAsync(shiftId, request.UserId))
        {
            throw new ConflictException("This professional is already assigned to this shift.");
        }

        var assignment = new ShiftAssignment
        {
            Id = Guid.NewGuid(),
            ShiftId = shiftId,
            UserId = request.UserId,
            AssignedAt = DateTime.UtcNow
        };

        await _shiftRepository.AddAssignmentAsync(assignment);

        // Invalidate all shift-related cache entries
        await _cacheService.RemoveByPrefixAsync("shifts:");
    }

    private static ShiftResponse MapToResponse(Shift shift)
    {
        return new ShiftResponse
        {
            Id = shift.Id,
            ClinicId = shift.ClinicId,
            Title = shift.Title,
            Date = shift.Date,
            StartTime = shift.StartTime,
            EndTime = shift.EndTime,
            CreatedAt = shift.CreatedAt,
            Assignments = shift.ShiftAssignments?.Select(a => new ShiftAssignmentResponse
            {
                Id = a.Id,
                UserId = a.UserId,
                AssignedAt = a.AssignedAt
            }).ToList() ?? new List<ShiftAssignmentResponse>()
        };
    }
}
