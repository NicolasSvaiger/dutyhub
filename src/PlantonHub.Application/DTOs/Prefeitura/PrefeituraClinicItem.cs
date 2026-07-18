namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Item da lista de UPAs do escopo do gestor — usado pra popular dropdowns
/// de filtro nas outras telas. Não tem paginação; a lista é pequena
/// (contratos por organ típico &lt; 50). Cache Redis 5 min.
/// </summary>
public class PrefeituraClinicItem
{
    public Guid ClinicId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }

    /// <summary>Contrato ativo que cobre essa UPA (informativo).</summary>
    public string? ContractNumber { get; set; }
}
