namespace PlantonHub.Application.Reports;

/// <summary>
/// Parâmetros consolidados de geração de relatório. Coleção mínima que
/// atende os 5 tipos — nem todos usam todos os campos (ex.: KPIs ignora
/// <c>Filter</c> e <c>Search</c>; History é o único que usa <c>Search</c>).
/// Ver design.md § "Exportação PDF / Excel".
/// </summary>
public class ReportRequest
{
    public ReportType Type { get; set; }
    public ReportFormat Format { get; set; }

    /// <summary>Início do período (UTC, inclusive).</summary>
    public DateTime From { get; set; }

    /// <summary>Fim do período (UTC, exclusive).</summary>
    public DateTime To { get; set; }

    /// <summary>Filtro opcional por UPA (aplica-se a Frequency, Atrasos, Ausencias).</summary>
    public Guid? ClinicId { get; set; }

    /// <summary>
    /// Filtro adicional específico do relatório:
    ///   - Atrasos/Ausencias: sempre override interno ("late"/"absence")
    ///   - History: category ("checkin" | "substitution" | "justification" | "alert")
    ///   - Demais: ignorado
    /// </summary>
    public string? Filter { get; set; }

    /// <summary>Busca textual — só History usa.</summary>
    public string? Search { get; set; }
}
