namespace PlantonHub.Application.DTOs.Registration;

public class RejectRegistrationRequest
{
    /// <summary>Motivo da rejeição (opcional, para auditoria).</summary>
    public string? Reason { get; set; }
}
