using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Users;

/// <summary>
/// Request for professional self-registration (no auth required).
/// </summary>
public class SelfRegisterRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public ProfessionalType ProfessionalType { get; set; }
    public string? Cpf { get; set; }
    public string? Phone { get; set; }
    public string? RegistrationNumber { get; set; }
    public string? Specialty { get; set; }
    public DateTime? DateOfBirth { get; set; }
}
