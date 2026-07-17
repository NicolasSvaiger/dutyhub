namespace PlantonHub.Domain.Enums;

/// <summary>Tipo de ocorrência que originou a substituição.</summary>
public enum SubstitutionReasonType
{
    /// <summary>Ausência não comunicada previamente — trata-se de uma urgência.</summary>
    UnannouncedAbsence = 1,

    /// <summary>Aviso antecipado de falta para um plantão futuro.</summary>
    AdvanceNotice = 2,

    /// <summary>Troca de turno acordada entre os profissionais.</summary>
    ShiftSwap = 3,

    /// <summary>Licença médica.</summary>
    MedicalLeave = 4,

    /// <summary>Atestado médico.</summary>
    MedicalCertificate = 5
}
