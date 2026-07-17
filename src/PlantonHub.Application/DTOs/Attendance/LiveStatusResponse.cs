namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Status calculado de um profissional dentro de um turno do dia:
///   - Presente: já fez check-in.
///   - Atrasado: sem check-in, tempo desde o início do turno excede a tolerância
///     mas ainda não passou do AbsenceThresholdMinutes.
///   - Ausente: sem check-in, tempo desde o início do turno excede o
///     AbsenceThresholdMinutes.
///   - Escalado: turno ainda não começou (futuro).
/// </summary>
public enum LiveAttendanceStatus
{
    Presente = 1,
    Atrasado = 2,
    Ausente = 3,
    Escalado = 4,
}

public class LiveShiftProfessionalResponse
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public LiveAttendanceStatus Status { get; set; }
    public DateTime? CheckInTime { get; set; }
}

public class LiveShiftResponse
{
    public Guid ShiftId { get; set; }
    public string Title { get; set; } = string.Empty;
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }

    /// <summary>True quando o horário atual está dentro do intervalo do turno.</summary>
    public bool IsActive { get; set; }

    public List<LiveShiftProfessionalResponse> Professionals { get; set; } = new();

    /// <summary>Vagas abertas neste turno (RequiredStaff - profissionais escalados), nunca negativo.</summary>
    public int OpenSlots { get; set; }
}

/// <summary>Status geral agregado de uma UPA no momento — usado para o "semáforo".</summary>
public enum ClinicLiveStatus
{
    Ok = 1,
    Atencao = 2,
    Critico = 3,
}

public class LiveClinicResponse
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public Guid? ContractId { get; set; }
    public string? ContractNumber { get; set; }
    public string? PublicOrganName { get; set; }

    public ClinicLiveStatus Status { get; set; }
    public List<LiveShiftResponse> Shifts { get; set; } = new();

    public int PresentCount { get; set; }
    public int LateCount { get; set; }
    public int AbsentCount { get; set; }
    public int OpenSlotsCount { get; set; }

    /// <summary>SLA do dia: % de slots preenchidos com presença confirmada (não atrasado/ausente).</summary>
    public int SlaPercent { get; set; }

    public string? LastEventDescription { get; set; }
    public DateTime? LastEventTime { get; set; }
}

public class LiveEventResponse
{
    public DateTime Time { get; set; }
    public string Type { get; set; } = string.Empty; // "ok" | "warn" | "critico"
    public string Description { get; set; } = string.Empty;
    public string ClinicName { get; set; } = string.Empty;
}

public class LiveStatusResponse
{
    public List<LiveClinicResponse> Clinics { get; set; } = new();
    public List<LiveEventResponse> RecentEvents { get; set; } = new();

    public int TotalPresent { get; set; }
    public int TotalLate { get; set; }
    public int TotalAbsent { get; set; }
    public int TotalOpenSlots { get; set; }
    public int OverallSlaPercent { get; set; }
}
