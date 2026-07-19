namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Timeline de plantões de uma UPA específica — <c>PrefeituraHistorico.tsx</c>
/// (nav "Unidades (UPAs)"). Diferente de <see cref="PrefeituraHistoryPage"/>
/// (timeline heterogênea de eventos administrativos), este DTO é focado em
/// check-in/check-out/atraso/ausência de plantões de UMA UPA por vez,
/// espelhando <c>op-historico.html</c> (seletor de UPA + KPIs + timeline
/// agrupada por dia + visão tabela).
/// </summary>
public class PrefeituraUnitTimelineResponse
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;

    public DateTime From { get; set; }
    public DateTime To { get; set; }

    public int TotalShifts { get; set; }
    public int Entradas { get; set; }
    public int Saidas { get; set; }
    public int Atrasos { get; set; }
    public int Ausencias { get; set; }

    /// <summary>Itens ordenados desc por data — um por (plantão, profissional).</summary>
    public List<PrefeituraUnitTimelineItem> Items { get; set; } = new();
}

public class PrefeituraUnitTimelineItem
{
    public Guid ShiftId { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;

    /// <summary>"Medico" | "Enfermeiro" — de <c>User.ProfessionalType</c>.</summary>
    public string? ProfessionalType { get; set; }

    public DateTime Date { get; set; }

    /// <summary>"manha" | "noite" — derivado do horário de início do plantão (sem conceito de turno no domínio).</summary>
    public string Turno { get; set; } = string.Empty;

    public TimeSpan ExpectedTime { get; set; }
    public DateTime? CheckInTime { get; set; }
    public DateTime? CheckOutTime { get; set; }

    /// <summary>"in" | "late" | "absent".</summary>
    public string Type { get; set; } = string.Empty;

    public int? MinutesLate { get; set; }
}
