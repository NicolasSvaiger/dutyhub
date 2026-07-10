using PlantonHub.Application.DTOs.Shifts;

namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Endpoint unificado que responde "qual o estado de attendance do profissional agora?"
/// O frontend usa um único GET pra decidir o que mostrar no modal de check-in / check-out,
/// sem precisar de múltiplas chamadas com race-condition entre elas.
///
/// Regras:
///   - canCheckIn: verdadeiro quando NÃO há check-in ativo E há pelo menos um shift hoje.
///   - canCheckOut: verdadeiro quando HÁ check-in ativo (tem o que fechar).
///   - hasActiveCheckIn: atalho booleano pra simplificar condicionais no front.
///   - activeAttendance: os dados do check-in em andamento (null se não há).
///   - availableShiftsToday: plantões do dia atribuídos ao profissional na clínica ativa.
/// </summary>
public class AttendanceStatusResponse
{
    /// <summary>True quando o profissional já tem check-in aberto (qualquer clínica).</summary>
    public bool HasActiveCheckIn { get; set; }

    /// <summary>True quando pode iniciar um novo check-in (sem ativos + há shifts hoje).</summary>
    public bool CanCheckIn { get; set; }

    /// <summary>True quando pode fazer check-out (tem check-in ativo).</summary>
    public bool CanCheckOut { get; set; }

    /// <summary>Dados do check-in ativo (null se não há). Inclui clínica e horário.</summary>
    public ActiveAttendanceInfo? ActiveAttendance { get; set; }

    /// <summary>Plantões de hoje disponíveis para check-in na clínica do header.</summary>
    public List<AvailableShiftInfo> AvailableShiftsToday { get; set; } = new();
}

/// <summary>Info resumida do check-in em andamento — exibida no modal de bloqueio.</summary>
public class ActiveAttendanceInfo
{
    public Guid Id { get; set; }
    public Guid ShiftId { get; set; }
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public DateTime CheckInTime { get; set; }
}

/// <summary>Shift de hoje disponível para check-in.</summary>
public class AvailableShiftInfo
{
    public Guid ShiftId { get; set; }
    public Guid ClinicId { get; set; }
    public string Title { get; set; } = string.Empty;
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
}
