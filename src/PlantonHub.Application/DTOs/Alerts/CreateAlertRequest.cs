using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Alerts;

public class CreateAlertRequest
{
    public AlertLevel Level { get; set; } = AlertLevel.Warning;
    public AlertType Type { get; set; } = AlertType.Other;

    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    public Guid? ClinicId { get; set; }
    public Guid? RelatedUserId { get; set; }
    public string? PrimaryActionLabel { get; set; }
    public string? SecondaryActionLabel { get; set; }

    /// <summary>Optional — se vazio, o serviço gera automático.</summary>
    public string? Code { get; set; }
}
