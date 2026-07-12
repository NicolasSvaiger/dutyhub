namespace PlantonHub.Application.DTOs.Users;

public class UserClinicRoleResponse
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ClinicId { get; set; }
    public string Role { get; set; } = string.Empty;
    public DateTime AssignedAt { get; set; }
}

public class UserResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? ProfessionalType { get; set; }
    public bool IsActive { get; set; }
    public string? Cpf { get; set; }
    public string? Phone { get; set; }
    public string? RegistrationNumber { get; set; }
    public string? Specialty { get; set; }
    public string? EmploymentType { get; set; }
    public DateTime? DateOfBirth { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<UserClinicRoleResponse> Roles { get; set; } = new();
}
