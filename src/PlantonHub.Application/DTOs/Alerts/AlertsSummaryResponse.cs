namespace PlantonHub.Application.DTOs.Alerts;

/// <summary>KPIs consolidados dos alertas (para os cards clicáveis da Central de Alertas).</summary>
public class AlertsSummaryResponse
{
    /// <summary>Todos os alertas registrados hoje (abertos + resolvidos criados hoje).</summary>
    public int TotalToday { get; set; }

    /// <summary>Total geral (independente de data).</summary>
    public int TotalAll { get; set; }

    /// <summary>Abertos por nível.</summary>
    public int OpenCritical { get; set; }
    public int OpenWarning { get; set; }
    public int OpenInfo { get; set; }

    /// <summary>Resolvidos hoje.</summary>
    public int ResolvedToday { get; set; }
}
