namespace PlantonHub.Domain.Enums;

/// <summary>
/// Status de sincronização de um evento de presença (Attendance).
/// </summary>
public enum SyncStatus
{
    /// <summary>
    /// Registrado online em tempo real.
    /// </summary>
    OnlineSynced = 1,

    /// <summary>
    /// Registrado offline e sincronizado com sucesso.
    /// </summary>
    OfflineSynced = 2,

    /// <summary>
    /// Sincronizado offline com atraso significativo.
    /// </summary>
    OfflineSyncedLate = 3,

    /// <summary>
    /// Sincronizado mas com flags de alerta (requer revisão manual).
    /// </summary>
    RequiresReview = 4,

    /// <summary>
    /// Rejeitado por falha de validação.
    /// </summary>
    Rejected = 5,

    /// <summary>
    /// Evento duplicado já processado anteriormente.
    /// </summary>
    DuplicateIgnored = 6
}
