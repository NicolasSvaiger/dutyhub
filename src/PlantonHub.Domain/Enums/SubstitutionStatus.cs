namespace PlantonHub.Domain.Enums;

public enum SubstitutionStatus
{
    /// <summary>Aguardando designação de substituto.</summary>
    Pending = 1,

    /// <summary>Substituto designado e confirmado.</summary>
    Confirmed = 2,

    /// <summary>Substituição cancelada.</summary>
    Cancelled = 3
}
