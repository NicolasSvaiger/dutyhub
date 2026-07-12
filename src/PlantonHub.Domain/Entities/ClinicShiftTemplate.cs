using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

/// <summary>
/// Template de turno configurado por UPA.
/// Define quantos turnos a UPA opera e seus horários.
/// </summary>
public class ClinicShiftTemplate
{
    public Guid Id { get; set; }
    public Guid ClinicId { get; set; }
    public string Name { get; set; } = string.Empty; // Ex: "Manhã", "Tarde", "Noite"
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public int RequiredStaff { get; set; } = 1; // Vagas por turno
    public int DisplayOrder { get; set; } // Ordem na grade
    public ProfessionalType ProfessionalType { get; set; } = ProfessionalType.Medico; // Médico ou Enfermeiro

    // Navigation
    public Clinic Clinic { get; set; } = null!;
}
