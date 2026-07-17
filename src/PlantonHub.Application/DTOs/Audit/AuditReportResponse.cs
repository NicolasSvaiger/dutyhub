namespace PlantonHub.Application.DTOs.Audit;

/// <summary>
/// Item na timeline da tela Auditoria (uma linha da lista).
/// </summary>
public class AuditLogEntry
{
    public Guid Id { get; set; }
    public DateTime Timestamp { get; set; }
    public string DateLabel { get; set; } = string.Empty;    // "11/05/2026"
    public string TimeLabel { get; set; } = string.Empty;    // "11:23:14"

    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string UserInitials { get; set; } = string.Empty;
    public string? UserRole { get; set; }

    /// <summary>Tipo normalizado — controla ícone/badge no frontend.</summary>
    public string Operation { get; set; } = string.Empty;

    public string OperationLabel { get; set; } = string.Empty;

    public string? Module { get; set; }
    public string Entity { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;

    public string Action { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string? IpAddress { get; set; }
    public string? BeforeValue { get; set; }
    public string? AfterValue { get; set; }
}

public class AuditKpis
{
    public int TotalEvents { get; set; }
    public int Creates { get; set; }
    public int Updates { get; set; }
    public int Deletes { get; set; }
    public int Logins { get; set; }
}

public class ModuleActivity
{
    public string Module { get; set; } = string.Empty;
    public int Count { get; set; }
    public string Color { get; set; } = "#6366f1";
}

public class TopUserActivity
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Initials { get; set; } = string.Empty;
    public string? Role { get; set; }
    public int Count { get; set; }
    public string Color { get; set; } = "#6366f1";
}

public class DailyCount
{
    public DateTime Date { get; set; }
    public string DayLabel { get; set; } = string.Empty; // "S", "T", …
    public int Count { get; set; }
}

/// <summary>
/// Payload lateral com resumos: KPIs 30d, atividade por módulo, top usuários
/// e série de 7 dias para o sparkline.
/// </summary>
public class AuditSummaryResponse
{
    public AuditKpis Kpis { get; set; } = new();
    public List<ModuleActivity> Modules { get; set; } = new();
    public List<TopUserActivity> TopUsers { get; set; } = new();
    public List<DailyCount> Last7Days { get; set; } = new();
}

/// <summary>Página filtrada da timeline.</summary>
public class AuditLogPage
{
    public List<AuditLogEntry> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages { get; set; }
}
