using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Justifications;

public class CreateJustificationRequest
{
    public Guid ClinicId { get; set; }
    public Guid AbsentUserId { get; set; }
    public DateTime ShiftDate { get; set; }
    public string ShiftTurn { get; set; } = string.Empty;
    public JustificationRequestType RequestType { get; set; }
    public string RequestText { get; set; } = string.Empty;
    public DateTime DeadlineDate { get; set; }

    /// <summary>Optional — protocolo custom. Se vazio, o serviço gera automático.</summary>
    public string? ProtocolNumber { get; set; }
}
