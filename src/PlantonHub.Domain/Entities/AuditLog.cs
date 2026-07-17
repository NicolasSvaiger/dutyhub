namespace PlantonHub.Domain.Entities;

public class AuditLog
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateTime Timestamp { get; set; }

    /// <summary>
    /// Tipo de operação normalizado: Create, Update, Delete, Login, Logout,
    /// Config, Export, System. É a granularidade da badge de tipo na tela.
    /// </summary>
    public string Operation { get; set; } = string.Empty;

    /// <summary>Nome da entidade alvo (User, Shift, Clinic, etc).</summary>
    public string Entity { get; set; } = string.Empty;

    /// <summary>Identificador do registro alvo (Guid, ProtocolNumber, etc).</summary>
    public string EntityId { get; set; } = string.Empty;

    /// <summary>Descrição livre / detalhamento do evento (pode conter HTML leve).</summary>
    public string? Details { get; set; }

    /// <summary>
    /// Módulo agrupador para a tela Auditoria: Escalas, Médicos, Configurações,
    /// Biometria, Contratos, Justificativas, Usuários, Acesso, Notificações, etc.
    /// </summary>
    public string? Module { get; set; }

    /// <summary>IP de origem da requisição (IPv4/IPv6).</summary>
    public string? IpAddress { get; set; }

    /// <summary>Valor anterior (útil em edições/configurações), texto livre.</summary>
    public string? BeforeValue { get; set; }

    /// <summary>Valor novo aplicado ao registro.</summary>
    public string? AfterValue { get; set; }

    // Navigation properties
    public User User { get; set; } = null!;
}
