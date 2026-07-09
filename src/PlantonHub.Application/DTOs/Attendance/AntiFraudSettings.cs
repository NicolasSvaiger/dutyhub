namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Configuration settings for anti-fraud detection thresholds.
/// </summary>
public class AntiFraudSettings
{
    /// <summary>
    /// Configuration section name in appsettings.json.
    /// </summary>
    public const string SectionName = "AntiFraudSettings";

    /// <summary>
    /// Maximum age in hours for an offline event before it's flagged as stale.
    /// Default: 48 hours.
    /// </summary>
    public double StaleEventThresholdHours { get; set; } = 48.0;

    /// <summary>
    /// Maximum acceptable clock skew in minutes before flagging.
    /// Default: 5 minutes (events in the future by more than this are flagged).
    /// </summary>
    public double ClockSkewThresholdMinutes { get; set; } = 5.0;

    /// <summary>
    /// Minimum app version required. Versions below this are flagged as outdated.
    /// Format: "major.minor.patch" (e.g., "1.0.0").
    /// </summary>
    public string MinimumAppVersion { get; set; } = "1.0.0";

    /// <summary>
    /// Number of recent submissions within the replay window to trigger a replay attack flag.
    /// Default: 3 (if the same LocalEventId is submitted more than this many times, flag it).
    /// </summary>
    public int ReplayAttackThreshold { get; set; } = 3;

    /// <summary>
    /// Time window in minutes to check for replay attacks (rapid re-submissions).
    /// Default: 10 minutes.
    /// </summary>
    public int ReplayAttackWindowMinutes { get; set; } = 10;
}
