namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Linha da tabela "Frequência por Médico" — <c>PrefeituraFrequencia.tsx</c>.
/// Uma linha por profissional, agregando todos os shifts do período em que
/// ele foi escalado (em qualquer UPA do escopo). <c>ClinicName</c> reflete a
/// UPA onde o profissional tem mais plantões escalados no período (a grande
/// maioria dos profissionais atua numa única UPA fixa).
/// </summary>
public class PrefeituraFrequencyByDoctorItem
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;

    /// <summary>CRM/COREN — null quando o cadastro não tem o campo preenchido.</summary>
    public string? RegistrationNumber { get; set; }

    /// <summary>"Medico" | "Enfermeiro" — de <c>User.ProfessionalType</c>. Null
    /// quando o cadastro não define o tipo (ex.: gestores, admin).</summary>
    public string? ProfessionalType { get; set; }

    /// <summary>UPA onde o profissional tem mais plantões escalados no período.</summary>
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;

    public int ExpectedShifts { get; set; }
    public int CompletedShifts { get; set; }
    public int Absences { get; set; }
    public int LateEvents { get; set; }

    /// <summary>Percentual (0..100) de plantões cumpridos sobre escalados.</summary>
    public double ComplianceRate { get; set; }
}
