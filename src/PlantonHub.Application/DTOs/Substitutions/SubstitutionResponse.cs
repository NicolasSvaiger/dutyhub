using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Substitutions;

public class SubstitutionResponse
{
    public Guid Id { get; set; }
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;

    public DateTime ShiftDate { get; set; }
    public string ShiftLabel { get; set; } = string.Empty;
    public TimeSpan ShiftStartTime { get; set; }
    public TimeSpan ShiftEndTime { get; set; }

    public SubstitutionReasonType ReasonType { get; set; }
    public string ReasonLabel => ReasonType switch
    {
        SubstitutionReasonType.UnannouncedAbsence => "Ausência não comunicada",
        SubstitutionReasonType.AdvanceNotice => "Aviso antecipado",
        SubstitutionReasonType.ShiftSwap => "Troca de turno",
        SubstitutionReasonType.MedicalLeave => "Licença médica",
        SubstitutionReasonType.MedicalCertificate => "Atestado",
        _ => "—"
    };

    public string? Notes { get; set; }

    public Guid AbsentUserId { get; set; }
    public string AbsentUserName { get; set; } = string.Empty;
    public string? AbsentUserRegistrationNumber { get; set; }

    public Guid? SubstituteUserId { get; set; }
    public string? SubstituteUserName { get; set; }
    public string? SubstituteUserRegistrationNumber { get; set; }

    public SubstitutionStatus Status { get; set; }
    public string StatusLabel => Status switch
    {
        SubstitutionStatus.Pending => "Pendente",
        SubstitutionStatus.Confirmed => "Confirmada",
        SubstitutionStatus.Cancelled => "Cancelada",
        _ => "—"
    };

    /// <summary>True when the shift date is today and there is still no substitute — needs urgent attention.</summary>
    public bool IsUrgent { get; set; }

    public DateTime? ConfirmedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
