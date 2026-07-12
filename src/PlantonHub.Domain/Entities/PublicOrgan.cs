namespace PlantonHub.Domain.Entities;

/// <summary>
/// Represents a public body (prefeitura / secretaria / subprefeitura)
/// that contracts the OS to manage healthcare units.
/// </summary>
public class PublicOrgan
{
    public Guid Id { get; set; }

    /// <summary>Full legal name, e.g. "Prefeitura Municipal de Santo André".</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Short acronym, e.g. "PMSA".</summary>
    public string? Acronym { get; set; }

    /// <summary>Brazilian CNPJ (digits only).</summary>
    public string? Cnpj { get; set; }

    /// <summary>Responsible department / secretaria.</summary>
    public string? Department { get; set; }

    /// <summary>City where the organ is based.</summary>
    public string? City { get; set; }

    /// <summary>State abbreviation, e.g. "SP".</summary>
    public string? State { get; set; }

    // ── Contact ──────────────────────────────────────────────────────────────

    public string? ContactName { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }

    // ── Hierarchy (subprefeitura support) ────────────────────────────────────

    /// <summary>
    /// Null = root organ (prefeitura).
    /// Non-null = child / subprefeitura.
    /// </summary>
    public Guid? ParentId { get; set; }
    public PublicOrgan? Parent { get; set; }
    public ICollection<PublicOrgan> Children { get; set; } = new List<PublicOrgan>();

    // ── Meta ─────────────────────────────────────────────────────────────────

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────

    public ICollection<Contract> Contracts { get; set; } = new List<Contract>();
}
