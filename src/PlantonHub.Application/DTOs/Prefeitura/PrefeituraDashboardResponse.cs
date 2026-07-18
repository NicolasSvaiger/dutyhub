namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Payload da tela "Início" do portal Prefeitura. KPIs do dia + resumo
/// operacional + últimos alertas. Consumido por <c>PrefeituraWelcome.tsx</c>.
/// Ver design.md § "Endpoints".
/// </summary>
public class PrefeituraDashboardResponse
{
    public DateTime AsOf { get; set; }
    public string PeriodLabel { get; set; } = string.Empty; // "Hoje, 17/07"

    /// <summary>Percentual de cumprimento hoje (0..100).</summary>
    public double TodayComplianceRate { get; set; }

    /// <summary>Total de plantões previstos hoje em todas as UPAs do escopo.</summary>
    public int TodayExpectedShifts { get; set; }

    /// <summary>Total de plantões cobertos por check-in hoje.</summary>
    public int TodayCoveredShifts { get; set; }

    /// <summary>Ausências ainda em aberto no dia.</summary>
    public int TodayOpenAbsences { get; set; }

    /// <summary>Atrasos acima da tolerância no dia.</summary>
    public int TodayLateEvents { get; set; }

    /// <summary>Nº total de UPAs cobertas pelos contratos ativos.</summary>
    public int ClinicCount { get; set; }

    /// <summary>Últimos alertas críticos/warnings ainda não resolvidos.</summary>
    public List<PrefeituraDashboardAlert> RecentAlerts { get; set; } = new();
}

public class PrefeituraDashboardAlert
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;

    /// <summary>"critical" | "warning" | "info" | "resolved".</summary>
    public string Level { get; set; } = "info";

    public string Title { get; set; } = string.Empty;
    public string? ClinicName { get; set; }
    public DateTime CreatedAt { get; set; }
}
