namespace PlantonHub.Application.DTOs.ManagementReport;

/// <summary>
/// Resposta completa do relatório gerencial para um período (mês/ano).
/// Agregação executiva usada na tela "Admin → Gerencial".
/// </summary>
public class ManagementReportResponse
{
    public int Year { get; set; }
    public int Month { get; set; }
    public string PeriodLabel { get; set; } = string.Empty; // "Maio 2026"

    public KpiWithTrend<double> SlaGlobal { get; set; } = new();
    public KpiWithTrend<int> TotalAbsences { get; set; } = new();
    public KpiWithTrend<int> TotalLateEvents { get; set; } = new();
    public ContractsInSlaKpi ContractsInSla { get; set; } = new();

    public List<ContractSlaSummary> Contracts { get; set; } = new();
    public List<ClinicRankItem> ClinicRanking { get; set; } = new();
    public List<ProblemDoctor> ProblemDoctors { get; set; } = new();
    public List<TrendCard> Trends { get; set; } = new();
    public SlaEvolution Evolution { get; set; } = new();
    public List<MeetingHighlight> Highlights { get; set; } = new();
}

/// <summary>Valor + variação vs período anterior (delta numérico).</summary>
public class KpiWithTrend<T>
{
    public T Value { get; set; } = default!;

    /// <summary>Diferença numérica vs período anterior (positiva ou negativa).</summary>
    public double? Delta { get; set; }

    /// <summary>"up" | "down" | "flat" — direção da variação.</summary>
    public string Direction { get; set; } = "flat";

    /// <summary>Texto pronto pra badge (ex.: "↑ +2,1% vs mês anterior").</summary>
    public string Label { get; set; } = string.Empty;
}

public class ContractsInSlaKpi
{
    public int InSla { get; set; }
    public int Total { get; set; }
    public string Direction { get; set; } = "flat";
    public string Label { get; set; } = string.Empty;
}

public class ContractSlaSummary
{
    public Guid ContractId { get; set; }
    public string ContractNumber { get; set; } = string.Empty;
    public string PublicOrganName { get; set; } = string.Empty;
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }

    /// <summary>SLA atingido no período em % (0..100).</summary>
    public double SlaPercent { get; set; }

    /// <summary>Meta contratual em % (0..100). Default 90 quando não informada.</summary>
    public double TargetPercent { get; set; } = 90;

    public int ClinicCount { get; set; }
    public int AbsenceCount { get; set; }

    /// <summary>Valor faturável no período (opcional; formatado no frontend).</summary>
    public decimal? MonthlyValue { get; set; }

    /// <summary>"ok" | "warn" | "crit" — badge de status.</summary>
    public string Status { get; set; } = "warn";
}

public class ClinicRankItem
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public double SlaPercent { get; set; }
    public int Position { get; set; }
}

public class ProblemDoctor
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Initials { get; set; } = string.Empty;
    public string? ClinicName { get; set; }

    /// <summary>Nº total de ocorrências no período (ausências + atrasos).</summary>
    public int OccurrenceCount { get; set; }
    public int AbsenceCount { get; set; }
    public int LateCount { get; set; }
}

public class TrendCard
{
    /// <summary>Chave interna: sla-trend, critical-doctors, top-clinic, alert-clinic, substitutions, justifications.</summary>
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string SubLabel { get; set; } = string.Empty;
    /// <summary>"up" | "down" | "flat".</summary>
    public string Direction { get; set; } = "flat";
}

public class SlaEvolution
{
    /// <summary>Últimos 5 meses em ordem crescente (ex.: ["Jan","Fev","Mar","Abr","Mai"]).</summary>
    public List<string> Months { get; set; } = new();

    /// <summary>Uma série por contrato (limite 2 no mock: SP e Guarulhos).</summary>
    public List<EvolutionSeries> ContractSeries { get; set; } = new();

    /// <summary>Ausências totais por mês (linha tracejada).</summary>
    public List<int> AbsencesByMonth { get; set; } = new();
}

public class EvolutionSeries
{
    public Guid ContractId { get; set; }
    public string Label { get; set; } = string.Empty;
    public string Color { get; set; } = "#6366f1";
    public List<double> Values { get; set; } = new();
}

public class MeetingHighlight
{
    /// <summary>"pos" | "neg" | "neu".</summary>
    public string Kind { get; set; } = "neu";
    public string Text { get; set; } = string.Empty;
}
