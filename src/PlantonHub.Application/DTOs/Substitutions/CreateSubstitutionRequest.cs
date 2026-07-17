using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Substitutions;

public class CreateSubstitutionRequest
{
    public Guid ClinicId { get; set; }
    public DateTime ShiftDate { get; set; }
    public string ShiftLabel { get; set; } = string.Empty;
    public TimeSpan ShiftStartTime { get; set; }
    public TimeSpan ShiftEndTime { get; set; }
    public SubstitutionReasonType ReasonType { get; set; }
    public string? Notes { get; set; }
    public Guid AbsentUserId { get; set; }

    /// <summary>Optional — if provided, the substitution is created already Confirmed.</summary>
    public Guid? SubstituteUserId { get; set; }
}
