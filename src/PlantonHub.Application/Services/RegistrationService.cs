using PlantonHub.Application.DTOs.Registration;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

/// <summary>
/// Orquestra o auto-cadastro de profissionais (mobile) e a aprovação pela OS.
/// Espelha o cadastro administrativo (infos + vínculos + biometria), mas cria
/// tudo em estado Pendente e só provisiona o Cognito na aprovação.
/// </summary>
public class RegistrationService : IRegistrationService
{
    private readonly IUserRepository _userRepository;
    private readonly IClinicRepository _clinicRepository;
    private readonly IFaceEnrollmentRepository _faceEnrollmentRepository;
    private readonly IAlertRepository _alertRepository;
    private readonly ICognitoAuthService _cognitoAuthService;
    private readonly ITenantService _tenantService;
    private readonly ICacheService _cacheService;

    public RegistrationService(
        IUserRepository userRepository,
        IClinicRepository clinicRepository,
        IFaceEnrollmentRepository faceEnrollmentRepository,
        IAlertRepository alertRepository,
        ICognitoAuthService cognitoAuthService,
        ITenantService tenantService,
        ICacheService cacheService)
    {
        _userRepository = userRepository;
        _clinicRepository = clinicRepository;
        _faceEnrollmentRepository = faceEnrollmentRepository;
        _alertRepository = alertRepository;
        _cognitoAuthService = cognitoAuthService;
        _tenantService = tenantService;
        _cacheService = cacheService;
    }

    public async Task<SelfRegisterResponse> SelfRegisterAsync(SelfRegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        if (await _userRepository.EmailExistsAsync(email))
            throw new ConflictException("Já existe um cadastro com este email.");

        // ProfessionalType é garantido Medico/Enfermeiro pelo validador.
        var role = request.ProfessionalType == ProfessionalType.Enfermeiro
            ? RoleType.Enfermeiro
            : RoleType.Medico;

        // Valida que todas as UPAs existem antes de criar qualquer coisa.
        var clinicIds = request.ClinicIds.Distinct().ToList();
        var clinics = (await _clinicRepository.GetByIdsAsync(clinicIds)).ToList();
        if (clinics.Count != clinicIds.Count)
            throw new NotFoundException("Uma ou mais UPAs informadas não existem.");

        var user = new User
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Email = email,
            // PasswordHash "impossível" — auth é via face-login (Cognito CUSTOM_AUTH),
            // nunca senha local. Mesmo padrão de UserService/GestorService.
            PasswordHash = "$2a$11$" + Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            ProfessionalType = request.ProfessionalType,
            IsActive = false,           // pendente não loga nem é escalável
            Status = UserStatus.Pendente,
            Cpf = string.IsNullOrWhiteSpace(request.Cpf) ? null : request.Cpf.Trim(),
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            RegistrationNumber = string.IsNullOrWhiteSpace(request.RegistrationNumber) ? null : request.RegistrationNumber.Trim(),
            Specialty = string.IsNullOrWhiteSpace(request.Specialty) ? null : request.Specialty.Trim(),
            EmploymentType = string.IsNullOrWhiteSpace(request.EmploymentType) ? null : request.EmploymentType.Trim(),
            DateOfBirth = request.DateOfBirth,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        await _userRepository.AddAsync(user);

        try
        {
            // Biometria opcional por enquanto: a validação vai migrar para um
            // provedor externo (Techmag) com modelo de hash. Se o app enviar um
            // embedding (modelo atual), guardamos; senão, segue sem biometria.
            if (request.FaceEmbedding is { Length: 128 })
            {
                await _faceEnrollmentRepository.AddAsync(new FaceEnrollment
                {
                    Id = Guid.NewGuid(),
                    UserId = user.Id,
                    Embedding = request.FaceEmbedding,
                    PhotoUrl = null,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                });
            }

            // Vínculos Pendente/Raio com as UPAs escolhidas pelo raio no app.
            foreach (var clinicId in clinicIds)
            {
                await _userRepository.AddClinicRoleAsync(new UserClinicRole
                {
                    Id = Guid.NewGuid(),
                    UserId = user.Id,
                    ClinicId = clinicId,
                    Role = role,
                    AssignedAt = DateTime.UtcNow,
                    Status = VinculoStatus.Pendente,
                    Source = VinculoSource.Raio,
                });
            }

            // Alerta para a OS revisar/aprovar.
            await CreateApprovalAlertAsync(user, clinics);
        }
        catch
        {
            // Rollback compensatório: apagar o user cascateia vínculos
            // (config) e a biometria (convenção). Best-effort.
            try { await _userRepository.DeleteAsync(user); } catch { /* ignore */ }
            throw;
        }

        return new SelfRegisterResponse
        {
            UserId = user.Id,
            Status = UserStatus.Pendente.ToString(),
            Message = "Cadastro recebido. Aguardando aprovação da OS.",
        };
    }

    public async Task ApproveAsync(Guid userId)
    {
        EnsureAdmin();
        if (!_tenantService.IsAdminGlobal() && !await _tenantService.CanOperateOnUserAsync(userId))
            throw new ForbiddenException("Você só pode aprovar cadastros das suas UPAs autorizadas.");

        var user = await _userRepository.GetByIdAsync(userId)
            ?? throw new NotFoundException($"Usuário '{userId}' não encontrado.");

        if (user.Status != UserStatus.Pendente)
            throw new ConflictException("Este cadastro não está pendente de aprovação.");

        // Provisiona a identidade no Cognito ANTES do commit local (idempotente).
        // Se falhar, o cadastro segue Pendente e o admin pode tentar de novo —
        // sem estado inconsistente.
        await _cognitoAuthService.EnsureUserExistsAsync(user.Email);

        user.Status = UserStatus.Ativo;
        user.IsActive = true;
        user.UpdatedAt = DateTime.UtcNow;

        foreach (var vinculo in user.UserClinicRoles.Where(r => r.Status == VinculoStatus.Pendente))
            vinculo.Status = VinculoStatus.Aprovado;

        await _userRepository.UpdateAsync(user);
        await _cacheService.RemoveByPrefixAsync("users:");
    }

    public async Task RejectAsync(Guid userId, string? reason)
    {
        EnsureAdmin();
        if (!_tenantService.IsAdminGlobal() && !await _tenantService.CanOperateOnUserAsync(userId))
            throw new ForbiddenException("Você só pode rejeitar cadastros das suas UPAs autorizadas.");

        var user = await _userRepository.GetByIdAsync(userId)
            ?? throw new NotFoundException($"Usuário '{userId}' não encontrado.");

        if (user.Status != UserStatus.Pendente)
            throw new ConflictException("Este cadastro não está pendente de aprovação.");

        user.Status = UserStatus.Inativo;
        user.IsActive = false;
        user.UpdatedAt = DateTime.UtcNow;
        await _userRepository.UpdateAsync(user);

        // LGPD: remove a biometria de um cadastro que não será aprovado.
        await _faceEnrollmentRepository.DeactivateAllForUserAsync(user.Id);

        await _cacheService.RemoveByPrefixAsync("users:");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void EnsureAdmin()
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);
        if (!isAdminGlobal && !isAdminClinica)
            throw new ForbiddenException("Apenas AdminGlobal ou AdminClinica podem aprovar/rejeitar cadastros.");
    }

    private async Task CreateApprovalAlertAsync(User user, List<Clinic> clinics)
    {
        var clinicNames = clinics.Count > 0
            ? string.Join(", ", clinics.Select(c => c.Name))
            : "—";
        var tipo = user.ProfessionalType == ProfessionalType.Enfermeiro ? "Enfermeiro(a)" : "Médico(a)";
        var registro = string.IsNullOrWhiteSpace(user.RegistrationNumber) ? "sem registro" : user.RegistrationNumber;

        var alert = new Alert
        {
            Id = Guid.NewGuid(),
            Code = await GenerateAlertCodeAsync(),
            Level = AlertLevel.Warning,
            Type = AlertType.PendingConfirmation,
            Title = "Novo auto-cadastro de profissional",
            Description = $"{tipo} {user.Name} ({registro}) solicitou cadastro para: {clinicNames}. Revise e aprove.",
            ClinicId = null,             // alerta global — visível aos admins
            RelatedUserId = user.Id,
            PrimaryActionLabel = "Aprovar cadastro",
            SecondaryActionLabel = "Ver profissional",
            IsResolved = false,
            CreatedAt = DateTime.UtcNow,
        };

        await _alertRepository.AddAsync(alert);
    }

    private async Task<string> GenerateAlertCodeAsync()
    {
        var year = DateTime.UtcNow.Year;
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var seq = Random.Shared.Next(1, 9999);
            var candidate = $"ALT-{year}-{seq:D4}";
            if (!await _alertRepository.CodeExistsAsync(candidate))
                return candidate;
        }
        return $"ALT-{year}-{DateTime.UtcNow.Ticks % 10000:D4}";
    }
}
