namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Página do histórico consolidado — <c>PrefeituraHistorico.tsx</c>.
/// Timeline paginada de eventos operacionais no escopo (check-ins,
/// ausências, substituições, alertas). Ordem descendente por timestamp.
/// </summary>
public class PrefeituraHistoryPage
{
    public List<PrefeituraHistoryItem> Items { get; set; } = new();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling((double)TotalCount / PageSize);
}

public class PrefeituraHistoryItem
{
    public DateTime Timestamp { get; set; }

    /// <summary>Categoria do evento: "checkin" | "absence" | "substitution" | "alert" | "justification".</summary>
    public string Type { get; set; } = string.Empty;

    /// <summary>Descrição curta pronta pra render (ex.: "Check-in Dr. João — UPA Centro").</summary>
    public string Title { get; set; } = string.Empty;

    public string? Details { get; set; }

    public Guid? UserId { get; set; }
    public string? UserName { get; set; }

    public Guid? ClinicId { get; set; }
    public string? ClinicName { get; set; }
}
