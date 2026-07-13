namespace PlantonHub.Domain.Entities;

/// <summary>
/// Singleton row that holds global system configuration.
/// There is always exactly one row (Id = well-known Guid).
/// </summary>
public class SystemSettings
{
    public static readonly Guid SingletonId = new("00000000-0000-0000-0000-000000000001");

    public Guid Id { get; set; } = SingletonId;

    // ── Check-in tolerances ──────────────────────────────────────────────────

    /// <summary>Global default check-in tolerance in minutes (applied when Clinic.CheckInToleranceMinutes is null).</summary>
    public int CheckInToleranceMinutes { get; set; } = 15;

    /// <summary>Minutes after shift start with no check-in before the system marks the slot as Absent.</summary>
    public int AbsenceThresholdMinutes { get; set; } = 60;

    /// <summary>Minutes after shift start after which the system refuses any check-in attempt.</summary>
    public int CheckInBlockAfterMinutes { get; set; } = 120;

    /// <summary>Whether the coordinator is notified immediately when an absence is detected.</summary>
    public bool NotifyOnAbsence { get; set; } = true;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
