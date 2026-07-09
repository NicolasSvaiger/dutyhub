namespace PlantonHub.Domain.Enums;

/// <summary>
/// Origem da sincronização de um evento de presença (Attendance).
/// </summary>
public enum SyncSource
{
    /// <summary>
    /// Registrado online (conexão ativa no momento do evento).
    /// </summary>
    Online = 1,

    /// <summary>
    /// Registrado offline e sincronizado posteriormente.
    /// </summary>
    Offline = 2
}
