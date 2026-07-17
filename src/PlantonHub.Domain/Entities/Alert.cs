using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

/// <summary>
/// Alerta do sistema (Central de Alertas). Gerado pelo backend a partir de
/// regras (ausências, atrasos, SLA baixo, contratos vencendo) ou criado
/// manualmente. A OS trata via resolve.
/// </summary>
public class Alert
{
    public Guid Id { get; set; }

    /// <summary>Código humano-legível, ex.: "ALT-2026-041".</summary>
    public string Code { get; set; } = string.Empty;

    public AlertLevel Level { get; set; }
    public AlertType Type { get; set; }

    public string Title { get; set; } = string.Empty;

    /// <summary>Descrição completa. Suporta HTML leve (strong) inline no frontend.</summary>
    public string Description { get; set; } = string.Empty;

    /// <summary>Clínica associada (null = alerta agregado / cross-clinic).</summary>
    public Guid? ClinicId { get; set; }
    public Clinic? Clinic { get; set; }

    /// <summary>Profissional relacionado ao alerta, quando aplicável.</summary>
    public Guid? RelatedUserId { get; set; }
    public User? RelatedUser { get; set; }

    /// <summary>Rótulo da ação primária, ex.: "Designar substituto".</summary>
    public string? PrimaryActionLabel { get; set; }

    /// <summary>Rótulo da ação secundária, ex.: "Ver escalas".</summary>
    public string? SecondaryActionLabel { get; set; }

    public bool IsResolved { get; set; } = false;
    public DateTime? ResolvedAt { get; set; }
    public Guid? ResolvedByUserId { get; set; }
    public User? ResolvedByUser { get; set; }

    /// <summary>Notas da resolução preenchidas pelo admin.</summary>
    public string? ResolutionNotes { get; set; }

    public DateTime CreatedAt { get; set; }
}
