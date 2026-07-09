using PlantonHub.Application.DTOs.Users;

namespace PlantonHub.Application.Interfaces;

public interface IUserService
{
    Task<IEnumerable<UserResponse>> GetAllAsync();
    Task<UserResponse?> GetByIdAsync(Guid userId);
    Task<UserResponse> CreateAsync(CreateUserRequest request);
    Task AssignClinicRoleAsync(Guid userId, AssignRoleRequest request);
}
