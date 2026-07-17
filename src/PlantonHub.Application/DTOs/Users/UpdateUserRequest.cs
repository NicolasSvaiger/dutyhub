using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Users;

/// <summary>
/// Payload for updating an existing professional. Excludes Password (managed via
/// Cognito reset flow) and Email (immutable identity — changing it would require
/// a Cognito user migration which is a separate flow).
///
/// All fields optional: only non-null values overwrite. This matches how
/// AdminMedicos edits — the drawer may only change specialty or phone without
/// resending everything.
/// </summary>
public class UpdateUserRequest
{
    public string? Name { get; set; }
    public ProfessionalType? ProfessionalType { get; set; }
    public string? Cpf { get; set; }
    public string? Phone { get; set; }
    public string? RegistrationNumber { get; set; }
    public string? Specialty { get; set; }
    public string? EmploymentType { get; set; }
    public DateTime? DateOfBirth { get; set; }
}
