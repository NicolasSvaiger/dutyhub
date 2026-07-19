using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Users;

/// <summary>
/// Payload for updating an existing professional. Excludes Password (managed via
/// Cognito reset flow — the professional resets it themselves, admin can't set it).
///
/// All fields optional: only non-null values overwrite. This matches how
/// AdminMedicos edits — the drawer may only change specialty or phone without
/// resending everything.
/// </summary>
public class UpdateUserRequest
{
    public string? Name { get; set; }

    /// <summary>
    /// Novo email do usuário. Quando informado, o backend também atualiza
    /// o atributo <c>email</c> no Cognito (username permanece o mesmo —
    /// Cognito não permite renomear o username, só o atributo). Requer
    /// que o novo email não esteja em uso por outro usuário local.
    /// </summary>
    public string? Email { get; set; }
    public ProfessionalType? ProfessionalType { get; set; }
    public string? Cpf { get; set; }
    public string? Phone { get; set; }
    public string? RegistrationNumber { get; set; }
    public string? Specialty { get; set; }
    public string? EmploymentType { get; set; }
    public DateTime? DateOfBirth { get; set; }
}
