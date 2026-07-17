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

    public int CheckInToleranceMinutes { get; set; } = 15;
    public int AbsenceThresholdMinutes { get; set; } = 60;
    public int CheckInBlockAfterMinutes { get; set; } = 120;
    public bool NotifyOnAbsence { get; set; } = true;

    // ── Fusos horários ───────────────────────────────────────────────────────

    /// <summary>IANA timezone identifier for the system default, e.g. "America/Sao_Paulo".</summary>
    public string SystemTimezone { get; set; } = "America/Sao_Paulo (UTC-3)";

    /// <summary>Automatically adjust for daylight saving time.</summary>
    public bool DaylightSavingAuto { get; set; } = true;

    // ── Notificações ─────────────────────────────────────────────────────────

    /// <summary>JSON-serialised notification channel map: { "EventName": { "email": true, "sms": false, "push": false } }.</summary>
    public string NotificationChannelsJson { get; set; } = "{}";

    public string EmailSender { get; set; } = "noreply@24p7.com.br";
    public string EmailSenderName { get; set; } = "Sistema 24p7";
    public string EmailCc { get; set; } = "";

    // ── Biometria (Azure Face API) ────────────────────────────────────────────

    public int BiometricConfidencePercent { get; set; } = 90;
    public int BiometricMaxAttempts { get; set; } = 3;
    public bool BiometricAllowManualCheckin { get; set; } = true;
    public bool BiometricLogFailedAttempt { get; set; } = false;
    public string AzureEndpoint { get; set; } = "https://24p7-face.cognitiveservices.azure.com";
    public string AzureRegion { get; set; } = "Brazil South";

    // ── Sistema Geral ────────────────────────────────────────────────────────

    public string OrgName { get; set; } = "OS Saúde Integrada";
    public string OrgCnpj { get; set; } = "";
    public string OrgEmail { get; set; } = "";

    /// <summary>Session inactivity timeout in minutes. 0 = never.</summary>
    public int SessionTimeoutMinutes { get; set; } = 30;

    public bool MfaRequired { get; set; } = true;

    /// <summary>Password rotation in days. 0 = never.</summary>
    public int PasswordRotationDays { get; set; } = 90;

    public bool DetailedAuditLog { get; set; } = true;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
