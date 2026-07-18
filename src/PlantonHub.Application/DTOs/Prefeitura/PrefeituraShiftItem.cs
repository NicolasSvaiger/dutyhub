namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Item da grade semanal de escalas — <c>PrefeituraEscalas.tsx</c>.
/// Read-only. Contém o profissional atribuído (via ShiftAssignment) e o
/// status de cobertura no momento da consulta (se já teve check-in ou não).
/// </summary>
public class PrefeituraShiftItem
{
    public Guid ShiftId { get; set; }
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }

    /// <summary>Profissionais atribuídos — nome + id pra debug.</summary>
    public List<PrefeituraShiftAssignment> Assignments { get; set; } = new();

    /// <summary>Nº de profissionais que já fizeram check-in.</summary>
    public int CheckedInCount { get; set; }
}

public class PrefeituraShiftAssignment
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public bool HasCheckedIn { get; set; }
}
