namespace PlantonHub.Domain.Enums;

/// <summary>
/// Status de validação de um evento offline de presença.
/// </summary>
public enum ValidationStatus
{
    /// <summary>
    /// Validação passou em todas as verificações.
    /// </summary>
    Passed = 1,

    /// <summary>
    /// Validação falhou (evento rejeitado).
    /// </summary>
    Failed = 2,

    /// <summary>
    /// Validação identificou situações que requerem revisão manual.
    /// </summary>
    RequiresReview = 3
}
