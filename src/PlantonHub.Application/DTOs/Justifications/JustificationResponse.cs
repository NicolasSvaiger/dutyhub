using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Justifications;

public class JustificationResponse
{
    public Guid Id { get; set; }
    public string ProtocolNumber { get; set; } = string.Empty;

    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;

    public Guid AbsentUserId { get; set; }
    public string AbsentUserName { get; set; } = string.Empty;
    public string? AbsentUserRegistrationNumber { get; set; }

    public DateTime ShiftDate { get; set; }
    public string ShiftTurn { get; set; } = string.Empty;

    public JustificationRequestType RequestType { get; set; }
    public string RequestTypeLabel => RequestType switch
    {
        JustificationRequestType.FormalJustification => "Solicitar justificativa formal",
        JustificationRequestType.ShiftReplacement => "Exigir reposição do plantão",
        JustificationRequestType.RegisterWarning => "Registrar advertência",
        JustificationRequestType.ContractPenalty => "Penalidade contratual",
        _ => "—",
    };

    public string RequestText { get; set; } = string.Empty;

    public DateTime DeadlineDate { get; set; }

    public JustificationStatus Status { get; set; }
    public string StatusLabel => Status switch
    {
        JustificationStatus.Pending => "Aguardando",
        JustificationStatus.UnderAnalysis => "Em análise",
        JustificationStatus.Approved => "Aprovada",
        JustificationStatus.Rejected => "Reprovada",
        _ => "—",
    };

    public string? ResponseText { get; set; }
    public DateTime? RespondedAt { get; set; }
    public Guid? RespondedByUserId { get; set; }
    public string? RespondedByUserName { get; set; }

    /// <summary>True quando o prazo já venceu e ainda não foi respondida.</summary>
    public bool IsDeadlineOverdue { get; set; }

    /// <summary>Dias restantes até o prazo (negativo se vencido, null se já respondida).</summary>
    public int? DaysToDeadline { get; set; }

    public DateTime CreatedAt { get; set; }
}
