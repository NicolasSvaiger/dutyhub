namespace PlantonHub.Domain.Enums;

/// <summary>Tipo de acionamento enviado pela Prefeitura à OS.</summary>
public enum JustificationRequestType
{
    /// <summary>Solicita justificativa formal por escrito.</summary>
    FormalJustification = 1,

    /// <summary>Exige reposição do plantão (horas não cumpridas).</summary>
    ShiftReplacement = 2,

    /// <summary>Solicita registro formal de advertência ao profissional.</summary>
    RegisterWarning = 3,

    /// <summary>Aplicação de penalidade contratual (multa/redução).</summary>
    ContractPenalty = 4
}
