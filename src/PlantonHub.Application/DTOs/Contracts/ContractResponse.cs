using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Contracts;

public class ContractClinicSummary
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public bool IsActive { get; set; }
}

public class ContractResponse
{
    public Guid Id { get; set; }
    public string ContractNumber { get; set; } = string.Empty;
    public Guid PublicOrganId { get; set; }
    public string PublicOrganName { get; set; } = string.Empty;
    public string? PublicOrganAcronym { get; set; }
    public decimal? MonthlyValue { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int? MinSlaPercent { get; set; }
    public ContractStatus Status { get; set; }
    public string StatusLabel => Status switch
    {
        ContractStatus.Active => "Ativo",
        ContractStatus.Renewal => "Renovação",
        ContractStatus.Inactive => "Inativo",
        _ => "—"
    };
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<ContractClinicSummary> Clinics { get; set; } = new();
}
