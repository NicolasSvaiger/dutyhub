using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

/// <summary>
/// Restrição de disponibilidade de um profissional para escalação.
/// Cobre férias, licenças, afastamentos e restrições recorrentes (turnos ou
/// dias da semana). Períodos ativos bloqueiam a escalação automática.
/// </summary>
public class AvailabilityRestriction
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public AvailabilityRestrictionType Type { get; set; }

    /// <summary>Data de início (inclusive), armazenada em UTC.</summary>
    public DateTime StartDate { get; set; }

    /// <summary>Data de fim (inclusive), armazenada em UTC.</summary>
    public DateTime EndDate { get; set; }

    /// <summary>
    /// Máscara de turnos indisponíveis quando Type == RestricaoTurno.
    /// Bit 0 = Manhã, Bit 1 = Tarde, Bit 2 = Noite. Null nos outros tipos.
    /// </summary>
    public int? BlockedShiftsMask { get; set; }

    /// <summary>
    /// Máscara de dias da semana bloqueados quando Type == DiasEspecificos.
    /// Bit 0 = Domingo … Bit 6 = Sábado. Null nos outros tipos.
    /// </summary>
    public int? BlockedWeekdaysMask { get; set; }

    /// <summary>Nº de atestado, processo administrativo, observação livre.</summary>
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Usuário admin que registrou a restrição — útil pra auditoria.</summary>
    public Guid? CreatedByUserId { get; set; }
}
