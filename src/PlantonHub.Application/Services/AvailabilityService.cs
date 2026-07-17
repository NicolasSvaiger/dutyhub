using PlantonHub.Application.DTOs.Availability;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

/// <summary>
/// Regras da tela "Disponibilidade":
///  • Restrições cobrem 5 tipos: férias, licença, afastamento, turno, dias.
///  • AdminGlobal vê/gerencia todas as restrições de qualquer profissional.
///  • AdminClinica só vê/gerencia profissionais que trabalham em suas clínicas.
///  • Profissionais (Medico/Enfermeiro/Tecnico) não têm acesso.
///  • Status computado hoje: Ferias/Licenca/Afastado (bloqueio total ativo)
///    tem prioridade sobre Restricao (turno/dias); Disponível caso contrário.
/// </summary>
public class AvailabilityService : IAvailabilityService
{
    private readonly IAvailabilityRestrictionRepository _restrictionRepo;
    private readonly IUserRepository _userRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly ITenantService _tenantService;

    public AvailabilityService(
        IAvailabilityRestrictionRepository restrictionRepo,
        IUserRepository userRepo,
        IClinicRepository clinicRepo,
        ITenantService tenantService)
    {
        _restrictionRepo = restrictionRepo;
        _userRepo = userRepo;
        _clinicRepo = clinicRepo;
        _tenantService = tenantService;
    }

    public async Task<IEnumerable<ProfessionalAvailabilityResponse>> GetProfessionalsAvailabilityAsync()
    {
        EnsureCanView();

        var allUsers = (await _userRepo.GetAllAsync()).ToList();

        // Filtra apenas profissionais operacionais (Médicos e Enfermeiros).
        var professionals = allUsers.Where(u =>
            u.IsActive && (
                u.ProfessionalType == ProfessionalType.Medico ||
                u.ProfessionalType == ProfessionalType.Enfermeiro ||
                (u.UserClinicRoles ?? new List<UserClinicRole>()).Any(r =>
                    r.Role == RoleType.Medico || r.Role == RoleType.Enfermeiro)
            )).ToList();

        // Se AdminClinica, escopa aos profissionais que têm role em alguma clínica autorizada.
        if (!_tenantService.IsAdminGlobal())
        {
            var authorized = _tenantService.GetAuthorizedClinicIds().ToHashSet();
            professionals = professionals.Where(u =>
                (u.UserClinicRoles ?? new List<UserClinicRole>()).Any(r => authorized.Contains(r.ClinicId))
            ).ToList();
        }

        var userIds = professionals.Select(u => u.Id).ToList();
        var restrictions = (await _restrictionRepo.GetByUserIdsAsync(userIds)).ToList();

        var today = DateTime.UtcNow.Date;
        return professionals
            .OrderBy(u => u.Name)
            .Select(u =>
            {
                var userRestrictions = restrictions.Where(r => r.UserId == u.Id).ToList();
                return new ProfessionalAvailabilityResponse
                {
                    UserId = u.Id,
                    UserName = u.Name,
                    RegistrationNumber = u.RegistrationNumber,
                    ProfessionalType = u.ProfessionalType?.ToString(),
                    IsActive = u.IsActive,
                    Status = ComputeStatusCode(userRestrictions, today),
                    StatusLabel = ComputeStatusLabel(userRestrictions, today),
                    Restrictions = userRestrictions.Select(MapRestriction).ToList(),
                };
            });
    }

    public async Task<AvailabilityRestrictionResponse> CreateRestrictionAsync(CreateAvailabilityRestrictionRequest request)
    {
        EnsureCanManage();

        if (request.EndDate.Date < request.StartDate.Date)
            throw new BadRequestException("Data fim deve ser maior ou igual à data início.");

        var user = await _userRepo.GetByIdAsync(request.UserId)
            ?? throw new NotFoundException($"User with id '{request.UserId}' not found.");

        // AdminClinica só pode registrar restrição para profissionais que
        // trabalham em pelo menos uma das clínicas autorizadas.
        if (!_tenantService.IsAdminGlobal())
        {
            var authorized = _tenantService.GetAuthorizedClinicIds().ToHashSet();
            var userIsScoped = (user.UserClinicRoles ?? new List<UserClinicRole>())
                .Any(r => authorized.Contains(r.ClinicId));
            if (!userIsScoped)
                throw new ForbiddenException("AdminClinica só pode gerenciar restrições de profissionais das suas clínicas.");
        }

        ValidateTypeSpecificFields(request);

        var now = DateTime.UtcNow;
        var restriction = new AvailabilityRestriction
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Type = request.Type,
            StartDate = DateTime.SpecifyKind(request.StartDate.Date, DateTimeKind.Utc),
            EndDate = DateTime.SpecifyKind(request.EndDate.Date, DateTimeKind.Utc),
            BlockedShiftsMask = request.Type == AvailabilityRestrictionType.RestricaoTurno ? request.BlockedShiftsMask : null,
            BlockedWeekdaysMask = request.Type == AvailabilityRestrictionType.DiasEspecificos ? request.BlockedWeekdaysMask : null,
            Notes = request.Notes,
            CreatedAt = now,
            CreatedByUserId = _tenantService.GetCurrentUserId(),
        };

        await _restrictionRepo.AddAsync(restriction);

        var created = await _restrictionRepo.GetByIdAsync(restriction.Id);
        return MapRestriction(created!);
    }

    public async Task DeleteRestrictionAsync(Guid restrictionId)
    {
        EnsureCanManage();

        var restriction = await _restrictionRepo.GetByIdAsync(restrictionId)
            ?? throw new NotFoundException($"Restriction with id '{restrictionId}' not found.");

        // AdminClinica só remove restrição de profissional escopado.
        if (!_tenantService.IsAdminGlobal())
        {
            var authorized = _tenantService.GetAuthorizedClinicIds().ToHashSet();
            var user = await _userRepo.GetByIdAsync(restriction.UserId);
            var userIsScoped = (user?.UserClinicRoles ?? new List<UserClinicRole>())
                .Any(r => authorized.Contains(r.ClinicId));
            if (!userIsScoped)
                throw new ForbiddenException("AdminClinica só pode remover restrições de profissionais das suas clínicas.");
        }

        await _restrictionRepo.DeleteAsync(restriction);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private void EnsureCanView()
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);
        if (!isAdminGlobal && !isAdminClinica)
            throw new ForbiddenException("Only AdminGlobal or AdminClinica can view availability.");
    }

    private void EnsureCanManage()
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);
        if (!isAdminGlobal && !isAdminClinica)
            throw new ForbiddenException("Only AdminGlobal or AdminClinica can manage availability restrictions.");
    }

    private static void ValidateTypeSpecificFields(CreateAvailabilityRestrictionRequest request)
    {
        if (request.Type == AvailabilityRestrictionType.RestricaoTurno)
        {
            if (request.BlockedShiftsMask is null or 0)
                throw new BadRequestException("Restrição de turno exige BlockedShiftsMask com pelo menos um turno.");
        }

        if (request.Type == AvailabilityRestrictionType.DiasEspecificos)
        {
            if (request.BlockedWeekdaysMask is null or 0)
                throw new BadRequestException("Restrição por dias exige BlockedWeekdaysMask com pelo menos um dia.");
        }
    }

    /// <summary>
    /// Retorna o status atual do profissional considerando restrições ativas hoje.
    /// Precedência: Ferias > LicencaMedica > Afastamento > Restricao > Disponivel.
    /// </summary>
    private static string ComputeStatusCode(List<AvailabilityRestriction> restrictions, DateTime today)
    {
        var active = restrictions.Where(r => r.StartDate.Date <= today && r.EndDate.Date >= today).ToList();
        if (active.Count == 0) return "Disponivel";

        if (active.Any(r => r.Type == AvailabilityRestrictionType.Ferias)) return "Ferias";
        if (active.Any(r => r.Type == AvailabilityRestrictionType.LicencaMedica)) return "Licenca";
        if (active.Any(r => r.Type == AvailabilityRestrictionType.AfastamentoAdministrativo)) return "Afastado";
        return "Restricao";
    }

    private static string ComputeStatusLabel(List<AvailabilityRestriction> restrictions, DateTime today) =>
        ComputeStatusCode(restrictions, today) switch
        {
            "Ferias" => "Férias",
            "Licenca" => "Licença",
            "Afastado" => "Afastado",
            "Restricao" => "Com restrição",
            _ => "Disponível",
        };

    private static AvailabilityRestrictionResponse MapRestriction(AvailabilityRestriction r) => new()
    {
        Id = r.Id,
        UserId = r.UserId,
        UserName = r.User?.Name ?? "—",
        UserRegistrationNumber = r.User?.RegistrationNumber,
        UserProfessionalType = r.User?.ProfessionalType?.ToString(),
        Type = r.Type,
        StartDate = r.StartDate,
        EndDate = r.EndDate,
        BlockedShiftsMask = r.BlockedShiftsMask,
        BlockedWeekdaysMask = r.BlockedWeekdaysMask,
        Notes = r.Notes,
        CreatedAt = r.CreatedAt,
    };
}
