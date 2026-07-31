namespace PlantonHub.Application.DTOs.Registration;

public class SelfRegisterResponse
{
    public Guid UserId { get; set; }

    /// <summary>Sempre "Pendente" no cadastro — aguarda aprovação da OS.</summary>
    public string Status { get; set; } = "Pendente";

    public string Message { get; set; } = string.Empty;
}
