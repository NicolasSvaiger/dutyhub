namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Grade semanal de escalas de UMA UPA — <c>PrefeituraEscalas.tsx</c>
/// (mock <c>op-escalas.html</c>). Linhas = turnos distintos observados na
/// semana (derivados de <c>StartTime</c>, mesma heurística de
/// <c>GetUnitTimelineAsync</c>); colunas = os 7 dias da semana.
///
/// "Confirmado vs pendente": o domínio não tem um conceito real de RSVP/
/// confirmação do profissional — <c>ShiftAssignment</c> só registra
/// <c>AssignedAt</c>. Heurística assumida (documentada em
/// <c>PrefeituraService.GetWeeklyScheduleAsync</c>): atribuições com menos
/// de 48h de idade em turnos futuros são "pendente" (recém-escalado, ainda
/// não decorreu tempo suficiente pra considerar estável); as demais são
/// "confirmado". Turnos já ocorridos são sempre "confirmado" (o profissional
/// já cumpriu ou a ausência é tratada nas telas de Atrasos/Ausências, não
/// aqui). "Sem cobertura" é real: vagas = <c>Clinic.DoctorsPerShift</c>
/// (meta) menos o nº de assignments no slot; sem meta configurada, não há
/// como sinalizar vaga aberta (fica 0).
/// </summary>
public class PrefeituraWeeklyScheduleResponse
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public int? DoctorsPerShiftTarget { get; set; }

    public DateTime WeekStart { get; set; }
    public DateTime WeekEnd { get; set; }

    /// <summary>Os 7 dias da semana (WeekStart..WeekStart+6), em ordem.</summary>
    public List<DateTime> Days { get; set; } = new();

    public int TotalShiftSlots { get; set; }
    public int TotalConfirmed { get; set; }
    public int TotalPending { get; set; }
    public int TotalUncovered { get; set; }

    /// <summary>Profissionais distintos (médicos + enfermeiros) escalados na
    /// semana. Nome mantido por compatibilidade.</summary>
    public int TotalDoctors { get; set; }

    /// <summary>Uma linha por turno distinto observado na semana, ordenada por horário de início.</summary>
    public List<PrefeituraScheduleRow> Rows { get; set; } = new();
}

public class PrefeituraScheduleRow
{
    /// <summary>"manha" | "tarde" | "noite".</summary>
    public string Turno { get; set; } = string.Empty;
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }

    /// <summary>Uma célula por dia da semana (mesma ordem de <c>Days</c>).</summary>
    public List<PrefeituraScheduleCell> Cells { get; set; } = new();
}

public class PrefeituraScheduleCell
{
    public DateTime Date { get; set; }
    public List<PrefeituraScheduleAssignment> Assignments { get; set; } = new();

    /// <summary>Vagas sem cobertura no slot (meta - assignments, mínimo 0).</summary>
    public int UncoveredCount { get; set; }
}

public class PrefeituraScheduleAssignment
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;

    /// <summary>"Medico" | "Enfermeiro" — de <c>User.ProfessionalType</c>.</summary>
    public string? ProfessionalType { get; set; }

    /// <summary>"confirmado" | "pendente" — ver heurística na doc da classe pai.</summary>
    public string Status { get; set; } = string.Empty;
}
