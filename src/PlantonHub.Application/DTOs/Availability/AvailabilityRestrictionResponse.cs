using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Availability;

public class AvailabilityRestrictionResponse
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? UserRegistrationNumber { get; set; }
    public string? UserProfessionalType { get; set; }

    public AvailabilityRestrictionType Type { get; set; }
    public string TypeLabel => Type switch
    {
        AvailabilityRestrictionType.Ferias => "Férias",
        AvailabilityRestrictionType.LicencaMedica => "Licença médica",
        AvailabilityRestrictionType.AfastamentoAdministrativo => "Afastamento administrativo",
        AvailabilityRestrictionType.RestricaoTurno => "Restrição de turno",
        AvailabilityRestrictionType.DiasEspecificos => "Dias específicos",
        _ => "—",
    };

    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    public int? BlockedShiftsMask { get; set; }
    public int? BlockedWeekdaysMask { get; set; }

    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Visão consolidada por profissional para a tela "Disponibilidade":
/// agrega todas as restrições de um usuário + status derivado (Disponível,
/// Férias, Licença, Afastado, Com restrição).
/// </summary>
public class ProfessionalAvailabilityResponse
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }
    public string? ProfessionalType { get; set; }
    public bool IsActive { get; set; }

    /// <summary>Status computado hoje: Disponivel | Ferias | Licenca | Afastado | Restricao.</summary>
    public string Status { get; set; } = "Disponivel";
    public string StatusLabel { get; set; } = "Disponível";

    public List<AvailabilityRestrictionResponse> Restrictions { get; set; } = new();
}
