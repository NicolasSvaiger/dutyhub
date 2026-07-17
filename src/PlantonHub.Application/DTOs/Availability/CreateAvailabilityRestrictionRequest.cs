using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Availability;

public class CreateAvailabilityRestrictionRequest
{
    public Guid UserId { get; set; }
    public AvailabilityRestrictionType Type { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    /// <summary>Bit 0 = Manhã, Bit 1 = Tarde, Bit 2 = Noite. Obrigatório quando Type == RestricaoTurno.</summary>
    public int? BlockedShiftsMask { get; set; }

    /// <summary>Bit 0 = Domingo … Bit 6 = Sábado. Obrigatório quando Type == DiasEspecificos.</summary>
    public int? BlockedWeekdaysMask { get; set; }

    public string? Notes { get; set; }
}
