using PlantonHub.Application.Constants;
using PlantonHub.Application.DTOs.Substitutions;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class SubstitutionService : ISubstitutionService
{
    private readonly ISubstitutionRepository _substitutionRepo;
    private readonly IUserRepository _userRepo;
    private readonly ITenantService _tenantService;

    public SubstitutionService(
        ISubstitutionRepository substitutionRepo,
        IUserRepository userRepo,
        ITenantService tenantService)
    {
        _substitutionRepo = substitutionRepo;
        _userRepo = userRepo;
        _tenantService = tenantService;
    }

    public async Task<IEnumerable<SubstitutionResponse>> GetAllAsync()
    {
        if (_tenantService.IsAdminGlobal())
        {
            var all = await _substitutionRepo.GetAllAsync();
            return all.Select(MapToResponse);
        }

        var authorizedClinicIds = _tenantService.GetAuthorizedClinicIds().ToHashSet();
        if (authorizedClinicIds.Count == 0)
            return Enumerable.Empty<SubstitutionResponse>();

        var scoped = await _substitutionRepo.GetByClinicIdsAsync(authorizedClinicIds);
        return scoped.Select(MapToResponse);
    }

    public async Task<SubstitutionResponse?> GetByIdAsync(Guid id)
    {
        var substitution = await _substitutionRepo.GetByIdAsync(id);
        if (substitution is null) return null;

        if (!_tenantService.IsAdminGlobal())
        {
            var authorized = _tenantService.GetAuthorizedClinicIds().ToHashSet();
            if (!authorized.Contains(substitution.ClinicId)) return null;
        }

        return MapToResponse(substitution);
    }

    public async Task<SubstitutionResponse> CreateAsync(CreateSubstitutionRequest request)
    {
        EnsureCanManage(request.ClinicId);

        var absentUser = await _userRepo.GetByIdAsync(request.AbsentUserId)
            ?? throw new NotFoundException($"User with id '{request.AbsentUserId}' not found.");

        User? substituteUser = null;
        if (request.SubstituteUserId.HasValue)
        {
            if (request.SubstituteUserId.Value == request.AbsentUserId)
                throw new BadRequestException("O substituto não pode ser o mesmo profissional ausente.");

            substituteUser = await _userRepo.GetByIdAsync(request.SubstituteUserId.Value)
                ?? throw new NotFoundException($"User with id '{request.SubstituteUserId.Value}' not found.");
        }

        var now = DateTime.UtcNow;
        var substitution = new Substitution
        {
            Id = Guid.NewGuid(),
            ClinicId = request.ClinicId,
            ShiftDate = DateTime.SpecifyKind(request.ShiftDate.Date, DateTimeKind.Utc),
            ShiftLabel = request.ShiftLabel,
            ShiftStartTime = request.ShiftStartTime,
            ShiftEndTime = request.ShiftEndTime,
            ReasonType = request.ReasonType,
            Notes = request.Notes,
            AbsentUserId = absentUser.Id,
            SubstituteUserId = substituteUser?.Id,
            Status = substituteUser is not null ? SubstitutionStatus.Confirmed : SubstitutionStatus.Pending,
            ConfirmedAt = substituteUser is not null ? now : null,
            CreatedAt = now,
        };

        await _substitutionRepo.AddAsync(substitution);

        var created = await _substitutionRepo.GetByIdAsync(substitution.Id);
        return MapToResponse(created!);
    }

    public async Task<SubstitutionResponse> AssignSubstituteAsync(Guid id, AssignSubstituteRequest request)
    {
        var substitution = await _substitutionRepo.GetByIdAsync(id)
            ?? throw new NotFoundException($"Substitution with id '{id}' not found.");

        EnsureCanManage(substitution.ClinicId);

        if (substitution.Status == SubstitutionStatus.Cancelled)
            throw new ConflictException("Cannot assign a substitute to a cancelled substitution.");

        if (request.SubstituteUserId == substitution.AbsentUserId)
            throw new BadRequestException("O substituto não pode ser o mesmo profissional ausente.");

        var substituteUser = await _userRepo.GetByIdAsync(request.SubstituteUserId)
            ?? throw new NotFoundException($"User with id '{request.SubstituteUserId}' not found.");

        substitution.SubstituteUserId = substituteUser.Id;
        substitution.Status = SubstitutionStatus.Confirmed;
        substitution.ConfirmedAt = DateTime.UtcNow;

        await _substitutionRepo.UpdateAsync(substitution);

        var updated = await _substitutionRepo.GetByIdAsync(id);
        return MapToResponse(updated!);
    }

    public async Task<SubstitutionResponse> CancelAsync(Guid id)
    {
        var substitution = await _substitutionRepo.GetByIdAsync(id)
            ?? throw new NotFoundException($"Substitution with id '{id}' not found.");

        EnsureCanManage(substitution.ClinicId);

        substitution.Status = SubstitutionStatus.Cancelled;
        await _substitutionRepo.UpdateAsync(substitution);

        var updated = await _substitutionRepo.GetByIdAsync(id);
        return MapToResponse(updated!);
    }

    /// <summary>
    /// AdminGlobal can manage substitutions for any clinic.
    /// AdminClinica can only manage substitutions for clinics they are authorized for.
    /// Any other role is forbidden.
    /// </summary>
    private void EnsureCanManage(Guid clinicId)
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
            throw new ForbiddenException("Only AdminClinica or AdminGlobal can manage substitutions.");

        if (isAdminClinica && !isAdminGlobal)
        {
            var authorized = _tenantService.GetAuthorizedClinicIds().ToHashSet();
            if (!authorized.Contains(clinicId))
                throw new ForbiddenException("AdminClinica can only manage substitutions for their own clinics.");
        }
    }

    private static SubstitutionResponse MapToResponse(Substitution s)
    {
        var today = DateTime.UtcNow.Date;
        return new SubstitutionResponse
        {
            Id = s.Id,
            ClinicId = s.ClinicId,
            ClinicName = s.Clinic?.Name ?? "—",
            ShiftDate = s.ShiftDate,
            ShiftLabel = s.ShiftLabel,
            ShiftStartTime = s.ShiftStartTime,
            ShiftEndTime = s.ShiftEndTime,
            ReasonType = s.ReasonType,
            Notes = s.Notes,
            AbsentUserId = s.AbsentUserId,
            AbsentUserName = s.AbsentUser?.Name ?? "—",
            AbsentUserRegistrationNumber = s.AbsentUser?.RegistrationNumber,
            SubstituteUserId = s.SubstituteUserId,
            SubstituteUserName = s.SubstituteUser?.Name,
            SubstituteUserRegistrationNumber = s.SubstituteUser?.RegistrationNumber,
            Status = s.Status,
            IsUrgent = s.Status == SubstitutionStatus.Pending && s.ShiftDate.Date <= today,
            ConfirmedAt = s.ConfirmedAt,
            CreatedAt = s.CreatedAt,
        };
    }
}
