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

    /// <summary>Nº de check-ins fora do horário (dentro dos turnos em
    /// andamento agora) — KPI "Atrasos" do mock op-realtime.html.</summary>
    public int TotalLateNow { get; set; }

    /// <summary>
    /// Feed de eventos recentes (check-in/atraso/check-out/ausência) dos
    /// turnos em andamento hoje, mais recente primeiro — seção "Eventos
    /// Recentes" do mock. Limitado às últimas ~20 ocorrências.
    /// </summary>
    public List<PrefeituraRealtimeEvent> RecentEvents { get; set; } = new();
}

public class PrefeituraRealtimeClinic
{
    public Guid ClinicId { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>Nº de profissionais escalados no momento (turnos em andamento).</summary>
    public int ExpectedCount { get; set; }

    /// <summary>Nº com check-in ativo (sem check-out ainda). Inclui atrasados.</summary>
    public int PresentCount { get; set; }

    /// <summary>Nº escalado sem check-in dentro do threshold de ausência.</summary>
    public int AbsentCount { get; set; }

    /// <summary>Nº que fez check-in fora da tolerância (subconjunto de PresentCount).</summary>
    public int LateCount { get; set; }

    /// <summary>"green" | "yellow" | "red" — cor do card no mockup.</summary>
    public string AlertLevel { get; set; } = "green";

    /// <summary>Nomes dos ausentes agora — pra listar no card.</summary>
    public List<string> AbsentUserNames { get; set; } = new();

    /// <summary>"manha" | "tarde" | "noite" do turno em andamento (heurística
    /// via <c>DeriveTurno</c>). Null se não há turno ativo agora.</summary>
    public string? TurnoCode { get; set; }

    public TimeSpan? ShiftStartTime { get; set; }
    public TimeSpan? ShiftEndTime { get; set; }

    /// <summary>Lista por-médico com status granular — cards do mock
    /// (Presente/Atrasado/Ausente/Aguardando) usam essa lista, não só os
    /// contadores agregados acima.</summary>
    public List<PrefeituraRealtimeDoctor> Doctors { get; set; } = new();

    /// <summary>Último evento (check-in ou ausência detectada) nessa UPA —
    /// linha "upa-last-event" do mock.</summary>
    public string? LastEventUserName { get; set; }

    /// <summary>"checkin" | "absence".</summary>
    public string? LastEventType { get; set; }

    public DateTime? LastEventTime { get; set; }
}

public class PrefeituraRealtimeDoctor
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }

    /// <summary>"Medico" | "Enfermeiro" — de <c>User.ProfessionalType</c>.</summary>
    public string? ProfessionalType { get; set; }

    /// <summary>"present" | "late" | "absent" | "upcoming".</summary>
    public string Status { get; set; } = "upcoming";

    public DateTime? CheckInTime { get; set; }

    /// <summary>Início previsto do turno (UTC) — usado pra exibir "Previsto HH:mm".</summary>
    public DateTime ExpectedTime { get; set; }
}

public class PrefeituraRealtimeEvent
{
    public DateTime Timestamp { get; set; }

    /// <summary>"checkin" | "late" | "checkout" | "absence".</summary>
    public string Type { get; set; } = "checkin";

    public Guid? UserId { get; set; }
    public string? UserName { get; set; }
    public string? ClinicName { get; set; }

    /// <summary>Preenchido só quando Type == "late".</summary>
    public int? MinutesLate { get; set; }
}
