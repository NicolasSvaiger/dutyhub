using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Contracts;

/// <summary>
/// Creates or upserts a PublicOrgan and links it to a new Contract in one operation.
/// </summary>
public class CreateContractRequest
{
    // ── Órgão Público ─────────────────────────────────────────────────────────
    public string OrganName { get; set; } = string.Empty;
    public string? OrganAcronym { get; set; }
    public string? OrganCnpj { get; set; }
    public string? OrganDepartment { get; set; }
    public string? OrganContactName { get; set; }
    public string? OrganContactEmail { get; set; }
    public string? OrganContactPhone { get; set; }
    public string? OrganCity { get; set; }
    public string? OrganState { get; set; }

    // ── Contrato ──────────────────────────────────────────────────────────────
    public string ContractNumber { get; set; } = string.Empty;
    public decimal? MonthlyValue { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int? MinSlaPercent { get; set; }
    public ContractStatus Status { get; set; } = ContractStatus.Active;
    public string? Notes { get; set; }
}
