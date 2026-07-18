namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Snapshot ao vivo do estado das UPAs — <c>PrefeituraRealtime.tsx</c> e
/// <c>PrefeituraTvMode.tsx</c>. Polling a cada 15s (real) / 10s (TV).
/// Cache Redis 15s absorve rajadas.
/// </summary>
public class PrefeituraRealtimeResponse
{
    public DateTime AsOf { get; set; }
    public List<PrefeituraRealtimeClinic> Clinics { get; set; } = new();

    // Agregados globais (uma linha de resumo na UI).
    public int TotalClinics { get; set; }
    public int TotalExpectedNow { get; set; }
    public int TotalPresentNow { get; set; }
    public int TotalAbsentNow { get; set; }
}

public class PrefeituraRealtimeClinic
{
    public Guid ClinicId { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>Nº de profissionais escalados no momento (turnos em andamento).</summary>
    public int ExpectedCount { get; set; }

    /// <summary>Nº com check-in ativo (sem check-out ainda).</summary>
    public int PresentCount { get; set; }

    /// <summary>Nº escalado sem check-in dentro do threshold de ausência.</summary>
    public int AbsentCount { get; set; }

    /// <summary>"green" | "yellow" | "red" — cor do card no mockup.</summary>
    public string AlertLevel { get; set; } = "green";

    /// <summary>Nomes dos ausentes agora — pra listar no card.</summary>
    public List<string> AbsentUserNames { get; set; } = new();
}
