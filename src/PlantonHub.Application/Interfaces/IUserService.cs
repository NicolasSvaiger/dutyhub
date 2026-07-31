using PlantonHub.Application.DTOs.Users;

namespace PlantonHub.Application.Interfaces;

public interface IUserService
{
    Task<IEnumerable<UserResponse>> GetAllAsync();
    Task<IEnumerable<UserResponse>> GetAdminUsersAsync();
    Task<UserResponse?> GetByIdAsync(Guid userId);
    Task<UserResponse?> GetMeAsync();
    Task<UserResponse> CreateAsync(CreateUserRequest request);
    Task<UserResponse?> UpdateAsync(Guid userId, UpdateUserRequest request);
    Task AssignClinicRoleAsync(Guid userId, AssignRoleRequest request);
    Task<UserResponse?> ToggleStatusAsync(Guid userId);

    /// <summary>
    /// Reenvia o email de convite a um usuário cujo convite ainda está
    /// pendente (nunca completou o primeiro login). Lança
    /// <c>ConflictException</c> se o usuário já aceitou.
    /// </summary>
    Task ResendInviteAsync(Guid userId);
}
