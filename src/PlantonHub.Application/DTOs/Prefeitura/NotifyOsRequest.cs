namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Body do endpoint <c>POST /api/prefeitura/absences/notify-os</c>.
/// Identifica a ausência via (ShiftId, UserId) — nós não persistimos
/// ausência como entity; ela é derivada de <c>Shift</c> + assignment
/// sem <c>Attendance</c> correspondente. Ver design.md § "Acionar OS".
/// </summary>
public class NotifyOsRequest
{
    /// <summary>Turno afetado pela ausência.</summary>
    public Guid ShiftId { get; set; }

    /// <summary>Profissional escalado que não compareceu.</summary>
    public Guid UserId { get; set; }

    /// <summary>Descrição adicional preenchida pelo gestor. Opcional.</summary>
    public string? Message { get; set; }
}
