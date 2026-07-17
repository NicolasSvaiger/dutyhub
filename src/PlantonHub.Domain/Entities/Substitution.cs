using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

/// <summary>
/// Represents a shift substitution: an absent professional whose shift
/// needs (or already has) a substitute assigned, for traceability and audit.
/// </summary>
public class Substitution
{
    public Guid Id { get; set; }

    public Guid ClinicId { get; set; }
    public Clinic Clinic { get; set; } = null!;

    /// <summary>Date of the original shift (date-only, stored at midnight UTC).</summary>
    public DateTime ShiftDate { get; set; }

    /// <summary>Display label for the turno, e.g. "Manhã (07h–19h)".</summary>
    public string ShiftLabel { get; set; } = string.Empty;

    public TimeSpan ShiftStartTime { get; set; }
    public TimeSpan ShiftEndTime { get; set; }

    public SubstitutionReasonType ReasonType { get; set; }

    /// <summary>Free-text observation about the reason / substitution.</summary>
    public string? Notes { get; set; }

    public Guid AbsentUserId { get; set; }
    public User AbsentUser { get; set; } = null!;

    /// <summary>Null until a substitute is designated.</summary>
    public Guid? SubstituteUserId { get; set; }
    public User? SubstituteUser { get; set; }

    public SubstitutionStatus Status { get; set; } = SubstitutionStatus.Pending;

    /// <summary>When the substitute was confirmed (Status moved to Confirmed).</summary>
    public DateTime? ConfirmedAt { get; set; }

    public DateTime CreatedAt { get; set; }
}
