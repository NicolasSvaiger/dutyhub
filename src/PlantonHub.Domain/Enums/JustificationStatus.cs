namespace PlantonHub.Domain.Enums;

public enum JustificationStatus
{
    /// <summary>Recebida pela OS, aguardando análise.</summary>
    Pending = 1,

    /// <summary>OS iniciou a análise mas ainda não decidiu.</summary>
    UnderAnalysis = 2,

    /// <summary>OS aprovou a justificativa.</summary>
    Approved = 3,

    /// <summary>OS reprovou a justificativa.</summary>
    Rejected = 4
}
