namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// KPIs agregados por período — consumido por <c>PrefeituraKpis.tsx</c>.
/// Retorna todos os cards do mockup <c>op-kpis.html</c> num único payload
/// para evitar 4-5 chamadas em série. Filtros de período aplicados a
/// tudo — os totais são do intervalo, os breakdowns são por UPA.
/// </summary>
public class PrefeituraKpisResponse
{
    public DateTime From { get; set; }
    public DateTime To { get; set; }

    /// <summary>Taxa global de cumprimento no período (0..100).</summary>
    public double GlobalComplianceRate { get; set; }

    public int TotalExpectedShifts { get; set; }
    public int TotalCoveredShifts { get; set; }
    public int TotalAbsences { get; set; }
    public int TotalLateEvents { get; set; }

    /// <summary>Média de minutos de atraso entre eventos com atraso.</summary>
    public double AverageLateMinutes { get; set; }

    /// <summary>Percentual de plantões com substituto acionado.</summary>
    public double SubstitutionRate { get; set; }

    /// <summary>Breakdown por UPA — mesmos KPIs por clínica.</summary>
    public List<PrefeituraKpiByClinic> ByClinic { get; set; } = new();
}

public class PrefeituraKpiByClinic
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public double ComplianceRate { get; set; }
    public int ExpectedShifts { get; set; }
    public int CoveredShifts { get; set; }
    public int Absences { get; set; }
    public int LateEvents { get; set; }
}
