namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Overall validation outcome for an offline event.
/// </summary>
public enum ValidationOutcome
{
    /// <summary>Event passed all validations and can be processed normally.</summary>
    Accepted,

    /// <summary>Event has warnings/flags but can still be processed (requires manual review).</summary>
    RequiresReview,

    /// <summary>Event failed critical validation and must be rejected.</summary>
    Rejected
}

/// <summary>
/// Result of validating a single offline attendance event.
/// Contains the overall outcome, validation messages, and anti-fraud flags.
/// </summary>
public class OfflineEventValidationResult
{
    /// <summary>
    /// Overall validation outcome: Accepted, RequiresReview, or Rejected.
    /// </summary>
    public ValidationOutcome Outcome { get; set; } = ValidationOutcome.Accepted;

    /// <summary>
    /// List of validation messages (warnings and errors).
    /// </summary>
    public List<string> Messages { get; set; } = new();

    /// <summary>
    /// List of anti-fraud flags detected during validation.
    /// Each flag has a programmatic code and a description.
    /// Events with any flag automatically get RequiresReview status.
    /// </summary>
    public List<AntiFraudFlag> AntiFraudFlags { get; set; } = new();

    /// <summary>
    /// Convenience property: true if the event should be rejected.
    /// </summary>
    public bool IsRejected => Outcome == ValidationOutcome.Rejected;

    /// <summary>
    /// Convenience property: true if the event requires manual review.
    /// </summary>
    public bool NeedsReview => Outcome == ValidationOutcome.RequiresReview;

    /// <summary>
    /// Convenience property: true if any anti-fraud flags were detected.
    /// </summary>
    public bool HasAntiFraudFlags => AntiFraudFlags.Count > 0;

    public static OfflineEventValidationResult Success() => new();
}
