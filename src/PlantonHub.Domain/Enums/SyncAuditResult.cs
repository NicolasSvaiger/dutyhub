namespace PlantonHub.Domain.Enums;

/// <summary>
/// Resultado da validação do evento offline na auditoria de sincronização.
/// </summary>
public enum SyncAuditResult
{
    /// <summary>
    /// Evento aceito e sincronizado com sucesso.
    /// </summary>
    Accepted = 1,

    /// <summary>
    /// Evento rejeitado por falha de validação.
    /// </summary>
    Rejected = 2,

    /// <summary>
    /// Evento aceito mas requer revisão manual (flags antifraude detectadas).
    /// </summary>
    RequiresReview = 3
}
