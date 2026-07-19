using PlantonHub.Application.Constants;
using PlantonHub.Application.DTOs.Users;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _userRepository;
    private readonly IClinicRepository _clinicRepository;
    private readonly ITenantService _tenantService;
    private readonly IPasswordHashService _passwordHashService;
    private readonly ICacheService _cacheService;
    private readonly ICognitoAuthService _cognitoAuthService;

    public UserService(
        IUserRepository userRepository,
        IClinicRepository clinicRepository,
        ITenantService tenantService,
        IPasswordHashService passwordHashService,
        ICacheService cacheService,
        ICognitoAuthService cognitoAuthService)
    {
        _userRepository = userRepository;
        _clinicRepository = clinicRepository;
        _tenantService = tenantService;
        _passwordHashService = passwordHashService;
        _cacheService = cacheService;
        _cognitoAuthService = cognitoAuthService;
    }

    public async Task<IEnumerable<UserResponse>> GetAdminUsersAsync()
    {
        var isAdminGlobal = _tenantService.IsAdminGlobal();

        if (isAdminGlobal)
        {
            // AdminGlobal: all admin users (AdminGlobal + AdminClinica)
            var users = await _userRepository.GetAllAsync();
            return users
                .Where(u => (u.UserClinicRoles ?? new List<UserClinicRole>()).Any(r =>
                    r.Role == RoleType.AdminGlobal || r.Role == RoleType.AdminClinica))
                .Select(MapToResponse);
        }
        else
        {
            // AdminClinica: admin users sharing the same clinics
            var authorizedClinicIds = _tenantService.GetAuthorizedClinicIds().ToList();
            if (authorizedClinicIds.Count == 0) return Enumerable.Empty<UserResponse>();

            var users = await _userRepository.GetAllAsync();
            return users
                .Where(u => (u.UserClinicRoles ?? new List<UserClinicRole>()).Any(r =>
                    (r.Role == RoleType.AdminClinica) &&
                    authorizedClinicIds.Contains(r.ClinicId)))
                .Select(MapToResponse);
        }
    }

    public async Task<IEnumerable<UserResponse>> GetAllAsync()
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
        {
            throw new ForbiddenException("Only AdminGlobal or AdminClinica can list users.");
        }

        // AdminGlobal: all users
        // AdminClinica: all professionals (Medico/Enfermeiro) — not scoped to clinic
        //   because a professional can work at multiple clinics/OS.
        //   Admin users of other OS are excluded for privacy.
        if (isAdminGlobal)
        {
            var users = await _userRepository.GetAllAsync();
            return users.Select(MapToResponse);
        }
        else
        {
            // Return only professionals — exclude AdminGlobal and AdminClinica of other orgs
            var users = await _userRepository.GetAllAsync();
            return users
                .Where(u => u.ProfessionalType == Domain.Enums.ProfessionalType.Medico ||
                            u.ProfessionalType == Domain.Enums.ProfessionalType.Enfermeiro ||
                            (u.UserClinicRoles ?? new List<UserClinicRole>()).Any(r =>
                                r.Role == RoleType.Medico || r.Role == RoleType.Enfermeiro))
                .Select(MapToResponse);
        }
    }

    public async Task<UserResponse?> GetByIdAsync(Guid userId)
    {
        var result = await _cacheService.GetOrSetAsync(
            CacheKeys.UserProfile(userId),
            async () =>
            {
                var user = await _userRepository.GetByIdAsync(userId);
                return user is not null ? MapToResponse(user) : null;
            });

        return result;
    }

    public async Task<UserResponse?> GetMeAsync()
    {
        var userId = _tenantService.GetCurrentUserId()
            ?? throw new UnauthorizedException("User not authenticated.");

        // Reusa a mesma chave/cache de GetByIdAsync — /users/me e /users/{id}
        // com o próprio id retornam exatamente o mesmo payload, o backend
        // não precisa duplicar a lógica.
        return await GetByIdAsync(userId);
    }

    /// <summary>
    /// Cria um novo usuário (colaborador da OS, médico ou enfermeiro) e o
    /// convida via Cognito — mesmo padrão do <see cref="GestorService.CreateAsync"/>
    /// (Sprint 7E). O <c>Password</c> do request é ignorado: o backend gera
    /// senha temporária aleatória no Cognito e o próprio Cognito envia o
    /// email de convite ao usuário, que troca a senha no primeiro login
    /// (challenge <c>NEW_PASSWORD_REQUIRED</c>).
    ///
    /// Pipeline com rollback compensatório: se o Cognito falhar após o
    /// Postgres já ter persistido o usuário, desfazemos o insert local
    /// pra não deixar um usuário "fantasma" sem credenciais válidas.
    /// </summary>
    public async Task<UserResponse> CreateAsync(CreateUserRequest request)
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
        {
            throw new ForbiddenException("Only AdminGlobal or AdminClinica can create users.");
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        if (await _userRepository.EmailExistsAsync(normalizedEmail))
        {
            throw new ConflictException("A user with this email already exists.");
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Email = normalizedEmail,
            // PasswordHash é obrigatório na entidade (legado). Auth real é
            // via Cognito — geramos um hash "impossível" (bcrypt de string
            // aleatória) que nunca é usado pra login local. Mesmo padrão do
            // GestorService.CreateAsync.
            PasswordHash = "$2a$11$" + Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            ProfessionalType = request.ProfessionalType,
            IsActive = true,
            Cpf = request.Cpf,
            Phone = request.Phone,
            RegistrationNumber = request.RegistrationNumber,
            Specialty = request.Specialty,
            EmploymentType = request.EmploymentType,
            DateOfBirth = request.DateOfBirth,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _userRepository.AddAsync(user);

        try
        {
            // Cria user no Cognito com senha temporária + envia email de
            // convite. Idempotente — se já existe, retorna sem erro.
            await _cognitoAuthService.CreateInvitedUserAsync(user.Email, user.Name);
        }
        catch
        {
            // Compensação: user já persistido no Postgres mas o Cognito
            // falhou. Rollback via delete local — o admin pode reexecutar
            // (o email vai bater no EmailExistsAsync se ainda estiver lá,
            // ou seguir limpo se o rollback funcionou).
            try { await _userRepository.DeleteAsync(user); }
            catch { /* rollback best-effort — a exception original é o que importa */ }
            throw;
        }

        // Invalidate all user-related cache entries
        await _cacheService.RemoveByPrefixAsync("users:");

        return MapToResponse(user);
    }

    public async Task<UserResponse?> UpdateAsync(Guid userId, UpdateUserRequest request)
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
        {
            throw new ForbiddenException("Only AdminGlobal or AdminClinica can update users.");
        }

        // AdminClinica can only update users sharing at least one authorized clinic.
        // AdminGlobal is not restricted. Same guard model as reset-device/setup-face-login.
        if (!isAdminGlobal && !await _tenantService.CanOperateOnUserAsync(userId))
        {
            throw new ForbiddenException("AdminClinica can only edit users of their authorized clinics.");
        }

        var user = await _userRepository.GetByIdAsync(userId);
        if (user is null) return null;

        // Troca de email: valida duplicidade e sincroniza com o Cognito
        // (que usa email como alias de login — trocar o atributo lá é o
        // que de fato permite o usuário logar com o novo endereço).
        // Feito antes de aplicar os outros campos pra falhar rápido sem
        // deixar updates parciais no meio do caminho.
        if (request.Email is not null)
        {
            var normalizedNewEmail = request.Email.Trim().ToLowerInvariant();
            if (!string.Equals(normalizedNewEmail, user.Email, StringComparison.OrdinalIgnoreCase))
            {
                if (await _userRepository.EmailExistsAsync(normalizedNewEmail))
                {
                    throw new ConflictException("A user with this email already exists.");
                }

                var oldEmail = user.Email;
                await _cognitoAuthService.UpdateEmailAsync(oldEmail, normalizedNewEmail);
                user.Email = normalizedNewEmail;
            }
        }

        // Apply only the fields that were sent. Null means "leave alone" —
        // this lets partial edits work without the client having to resend
        // the full profile. Empty string is treated as clear (for optional
        // scalar fields where an empty value is meaningful).
        if (request.Name is not null) user.Name = request.Name;
        if (request.ProfessionalType.HasValue) user.ProfessionalType = request.ProfessionalType;
        if (request.Cpf is not null) user.Cpf = string.IsNullOrWhiteSpace(request.Cpf) ? null : request.Cpf;
        if (request.Phone is not null) user.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone;
        if (request.RegistrationNumber is not null) user.RegistrationNumber = string.IsNullOrWhiteSpace(request.RegistrationNumber) ? null : request.RegistrationNumber;
        if (request.Specialty is not null) user.Specialty = string.IsNullOrWhiteSpace(request.Specialty) ? null : request.Specialty;
        if (request.EmploymentType is not null) user.EmploymentType = string.IsNullOrWhiteSpace(request.EmploymentType) ? null : request.EmploymentType;
        if (request.DateOfBirth.HasValue) user.DateOfBirth = request.DateOfBirth;

        user.UpdatedAt = DateTime.UtcNow;
        await _userRepository.UpdateAsync(user);

        // Invalidate both the specific-user cache and the listing cache — a
        // rename or role change must be visible in AdminMedicos immediately.
        await _cacheService.RemoveAsync(CacheKeys.UserProfile(userId));
        await _cacheService.RemoveByPrefixAsync("users:");

        return MapToResponse(user);
    }

    public async Task AssignClinicRoleAsync(Guid userId, AssignRoleRequest request)
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
        {
            throw new ForbiddenException("Only AdminGlobal or AdminClinica can assign roles.");
        }

        // AdminClinica can only assign roles for clinics they are authorized for
        if (isAdminClinica && !isAdminGlobal)
        {
            var authorizedClinicIds = _tenantService.GetAuthorizedClinicIds().ToHashSet();
            if (!authorizedClinicIds.Contains(request.ClinicId))
            {
                throw new ForbiddenException("AdminClinica can only assign roles for their authorized clinics.");
            }
        }

        var user = await _userRepository.GetByIdAsync(userId);
        if (user is null)
        {
            throw new NotFoundException($"User with id '{userId}' not found.");
        }

        var clinic = await _clinicRepository.GetByIdAsync(request.ClinicId);
        if (clinic is null)
        {
            throw new NotFoundException($"Clinic with id '{request.ClinicId}' not found.");
        }

        var clinicRole = new UserClinicRole
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ClinicId = request.ClinicId,
            Role = request.Role,
            AssignedAt = DateTime.UtcNow
        };

        await _userRepository.AddClinicRoleAsync(clinicRole);

        // Invalidate the specific user profile cache
        await _cacheService.RemoveAsync(CacheKeys.UserProfile(userId));
    }

    public async Task<UserResponse?> ToggleStatusAsync(Guid userId)
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
        {
            throw new ForbiddenException("Only AdminGlobal or AdminClinica can toggle user status.");
        }

        var user = await _userRepository.GetByIdAsync(userId);
        if (user is null)
        {
            return null;
        }

        // Bloqueia desativar o último AdminGlobal ativo do sistema —
        // sem isso, um erro de clique deixaria a OS sem nenhum admin
        // master pra reverter a ação (nem via seed, sem acesso ao DB).
        var isTargetAdminGlobal = (user.UserClinicRoles ?? new List<UserClinicRole>())
            .Any(r => r.Role == RoleType.AdminGlobal);
        if (isTargetAdminGlobal && user.IsActive)
        {
            var allUsers = await _userRepository.GetAllAsync();
            var activeAdminGlobalCount = allUsers.Count(u =>
                u.IsActive &&
                (u.UserClinicRoles ?? new List<UserClinicRole>()).Any(r => r.Role == RoleType.AdminGlobal));

            if (activeAdminGlobalCount <= 1)
            {
                throw new ConflictException("Não é possível desativar o único Admin Master ativo do sistema.");
            }
        }

        user.IsActive = !user.IsActive;
        user.UpdatedAt = DateTime.UtcNow;
        await _userRepository.UpdateAsync(user);

        // Invalidate cache
        await _cacheService.RemoveAsync(CacheKeys.UserProfile(userId));
        await _cacheService.RemoveByPrefixAsync("users:");

        return MapToResponse(user);
    }

    private static UserResponse MapToResponse(User user)
    {
        return new UserResponse
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            ProfessionalType = user.ProfessionalType?.ToString(),
            IsActive = user.IsActive,
            Cpf = user.Cpf,
            Phone = user.Phone,
            RegistrationNumber = user.RegistrationNumber,
            Specialty = user.Specialty,
            EmploymentType = user.EmploymentType,
            DateOfBirth = user.DateOfBirth,
            CreatedAt = user.CreatedAt,
            UpdatedAt = user.UpdatedAt,
            Roles = (user.UserClinicRoles ?? new List<UserClinicRole>()).Select(r => new UserClinicRoleResponse
            {
                Id = r.Id,
                UserId = r.UserId,
                ClinicId = r.ClinicId,
                Role = r.Role.ToString(),
                AssignedAt = r.AssignedAt
            }).ToList()
        };
    }
}
