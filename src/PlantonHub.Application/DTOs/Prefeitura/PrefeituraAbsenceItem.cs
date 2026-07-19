namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Item das telas <c>PrefeituraAtrasos.tsx</c> e <c>PrefeituraAusencias.tsx</c>.
/// Ambas usam o mesmo DTO — o filtro <c>type</c> no endpoint decide:
///   - "late": atrasos acima da tolerância
///   - "absence": ausências (sem check-in até o threshold ausência)
///   - null: os dois juntos
/// </summary>
public class PrefeituraAbsenceItem
{
    public Guid Id { get; set; }

    /// <summary>"late" | "absence".</summary>
    public string Type { get; set; } = "absence";

    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;

    /// <summary>"Medico" | "Enfermeiro" — de <c>User.ProfessionalType</c>.</summary>
    public string? ProfessionalType { get; set; }

    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;

    public DateTime Date { get; set; }

    /// <summary>Rótulo do turno afetado — "Manhã", "Tarde", "Noite" ou intervalo.</summary>
    public string ShiftLabel { get; set; } = string.Empty;

    /// <summary>Minutos de atraso quando aplicável (null para ausências completas).</summary>
    public int? MinutesLate { get; set; }

    /// <summary>Marca justificado quando existe uma <c>Justification</c> aceita.</summary>
    public bool Justified { get; set; }

    /// <summary>
    /// Quando existe uma substituição vinculada, o nome do substituto.
    /// Usado pelo mockup para mostrar "coberto por X".
    /// </summary>
    public string? SubstituteName { get; set; }

    /// <summary>
    /// Situação granular no estilo op-ausencias.html — só preenchida quando
    /// <c>Type == "absence"</c> (o mock só classifica ausências, não atrasos):
    ///   - "sem-justificativa": nenhuma Justification nem Substitution aberta.
    ///   - "pendente": há Substitution com Status == Pending (reposição não
    ///     confirmada ainda).
    ///   - "em-analise": há Justification com Status Pending/UnderAnalysis
    ///     (OS ainda não decidiu).
    ///   - "resolvido": Justification Approved/Rejected (OS já decidiu) OU
    ///     Substitution Confirmed (reposição já coberta).
    /// Null para itens Type == "late" (o mock trata atrasos em tela própria).
    /// </summary>
    public string? Status { get; set; }
}
