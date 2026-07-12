using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

/// <summary>
/// Represents the legal contract between a PublicOrgan (prefeitura)
/// and the OS (24p7), covering one or more clinics (UPAs).
/// </summary>
public class Contract
{
    public Guid Id { get; set; }

    /// <summary>Official contract number, e.g. "CT-2024-0087".</summary>
    public string ContractNumber { get; set; } = string.Empty;

    public Guid PublicOrganId { get; set; }
    public PublicOrgan PublicOrgan { get; set; } = null!;

    /// <summary>Monthly value in BRL.</summary>
    public decimal? MonthlyValue { get; set; }

    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    /// <summary>Minimum SLA percentage required (e.g. 90 = 90%).</summary>
    public int? MinSlaPercent { get; set; }

    public ContractStatus Status { get; set; } = ContractStatus.Active;

    /// <summary>Free-text observations / special clauses.</summary>
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────

    /// <summary>UPAs covered by this contract.</summary>
    public ICollection<Clinic> Clinics { get; set; } = new List<Clinic>();
}
