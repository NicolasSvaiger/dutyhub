namespace PlantonHub.Domain.Enums;

/// <summary>Categoria do alerta.</summary>
public enum AlertType
{
    UncoveredShift = 1,
    UnannouncedAbsence = 2,
    Delay = 3,
    SlaBelow = 4,
    ContractExpiring = 5,
    PendingConfirmation = 6,
    Other = 99,
}
