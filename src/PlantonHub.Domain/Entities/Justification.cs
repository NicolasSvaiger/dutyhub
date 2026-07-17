using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

/// <summary>
/// Acionamento formal enviado pela Prefeitura (Órgão Público) à OS,
/// pedindo justificativa/reposição/penalidade por uma ocorrência em plantão.
/// A OS analisa e responde (aprovar ou reprovar) dentro do prazo contratual.
/// </summary>
public class Justification
{
    public Guid Id { get; set; }

    /// <summary>Protocolo humano-legível, ex.: "JUS-2026-041".</summary>
    public string ProtocolNumber { get; set; } = string.Empty;

    public Guid ClinicId { get; set; }
    public Clinic Clinic { get; set; } = null!;

    /// <summary>Profissional envolvido na ocorrência.</summary>
    public Guid AbsentUserId { get; set; }
    public User AbsentUser { get; set; } = null!;

    /// <summary>Data do plantão em questão.</summary>
    public DateTime ShiftDate { get; set; }

    /// <summary>Rótulo do turno, ex.: "Manhã".</summary>
    public string ShiftTurn { get; set; } = string.Empty;

    public JustificationRequestType RequestType { get; set; }

    /// <summary>Texto do questionamento enviado pela Prefeitura.</summary>
    public string RequestText { get; set; } = string.Empty;

    /// <summary>Prazo (data) para a OS responder.</summary>
    public DateTime DeadlineDate { get; set; }

    public JustificationStatus Status { get; set; } = JustificationStatus.Pending;

    /// <summary>Texto de resposta formal da OS (preenchido quando responde).</summary>
    public string? ResponseText { get; set; }

    public DateTime? RespondedAt { get; set; }

    /// <summary>Usuário da OS que respondeu (para auditoria).</summary>
    public Guid? RespondedByUserId { get; set; }
    public User? RespondedByUser { get; set; }

    public DateTime CreatedAt { get; set; }
}
