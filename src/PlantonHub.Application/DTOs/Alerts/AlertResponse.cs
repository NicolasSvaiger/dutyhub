using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Alerts;

public class AlertResponse
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;

    public AlertLevel Level { get; set; }
    public string LevelLabel => Level switch
    {
        AlertLevel.Critical => "Crítico",
        AlertLevel.Warning => "Atenção",
        AlertLevel.Info => "Informativo",
        AlertLevel.Resolved => "Resolvido",
        _ => "—",
    };

    public AlertType Type { get; set; }
    public string TypeLabel => Type switch
    {
        AlertType.UncoveredShift => "Turno descoberto",
        AlertType.UnannouncedAbsence => "Ausência",
        AlertType.Delay => "Atraso",
        AlertType.SlaBelow => "SLA",
        AlertType.ContractExpiring => "Contrato",
        AlertType.PendingConfirmation => "Confirmação",
        AlertType.Other => "Outro",
        _ => "—",
    };

    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    public Guid? ClinicId { get; set; }
    public string? ClinicName { get; set; }

    public Guid? RelatedUserId { get; set; }
    public string? RelatedUserName { get; set; }

    public string? PrimaryActionLabel { get; set; }
    public string? SecondaryActionLabel { get; set; }

    public bool IsResolved { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public Guid? ResolvedByUserId { get; set; }
    public string? ResolvedByUserName { get; set; }
    public string? ResolutionNotes { get; set; }

    public DateTime CreatedAt { get; set; }
}
