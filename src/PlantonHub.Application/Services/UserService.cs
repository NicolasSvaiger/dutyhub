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

    public UserService(
        IUserRepository userRepository,
        IClinicRepository clinicRepository,
        ITenantService tenantService,
        IPasswordHashService passwordHashService,
        ICacheService cacheService)
    {
        _userRepository = userRepository;
        _clinicRepository = clinicRepository;
        _tenantService = tenantService;
        _passwordHashService = passwordHashService;
        _cacheService = cacheService;
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

    public async Task<UserResponse> CreateAsync(CreateUserRequest request)
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
        {
            throw new ForbiddenException("Only AdminGlobal or AdminClinica can create users.");
        }

        if (await _userRepository.EmailExistsAsync(request.Email))
        {
            throw new ConflictException("A user with this email already exists.");
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Email = request.Email,
            PasswordHash = _passwordHashService.HashPassword(request.Password),
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

        // Invalidate all user-related cache entries
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
