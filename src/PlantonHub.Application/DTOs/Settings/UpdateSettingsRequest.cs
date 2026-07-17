namespace PlantonHub.Application.DTOs.Settings;

public class ClinicToleranceUpdate
{
    public Guid ClinicId { get; set; }
    public int? CheckInToleranceMinutes { get; set; }
}

public class NotifChannelUpdate
{
    public bool Email { get; set; }
    public bool Sms { get; set; }
    public bool Push { get; set; }
}

public class UpdateSettingsRequest
{
    // ── Tolerâncias ──────────────────────────────────────────────────────────
    public int CheckInToleranceMinutes { get; set; } = 15;
    public int AbsenceThresholdMinutes { get; set; } = 60;
    public int CheckInBlockAfterMinutes { get; set; } = 120;
    public bool NotifyOnAbsence { get; set; } = true;
    public List<ClinicToleranceUpdate> ClinicTolerances { get; set; } = new();

    // ── Fusos ────────────────────────────────────────────────────────────────
    public string SystemTimezone { get; set; } = "America/Sao_Paulo (UTC-3)";
    public bool DaylightSavingAuto { get; set; } = true;

    // ── Notificações ─────────────────────────────────────────────────────────
    public Dictionary<string, NotifChannelUpdate> NotificationChannels { get; set; } = new();
    public string EmailSender { get; set; } = string.Empty;
    public string EmailSenderName { get; set; } = string.Empty;
    public string EmailCc { get; set; } = string.Empty;

    // ── Biometria ────────────────────────────────────────────────────────────
    public int BiometricConfidencePercent { get; set; } = 90;
    public int BiometricMaxAttempts { get; set; } = 3;
    public bool BiometricAllowManualCheckin { get; set; } = true;
    public bool BiometricLogFailedAttempt { get; set; } = false;
    public string AzureEndpoint { get; set; } = string.Empty;
    public string AzureRegion { get; set; } = "Brazil South";

    // ── Sistema Geral ─────────────────────────────────────────────────────────
    public string OrgName { get; set; } = string.Empty;
    public string OrgCnpj { get; set; } = string.Empty;
    public string OrgEmail { get; set; } = string.Empty;
    public int SessionTimeoutMinutes { get; set; } = 30;
    public bool MfaRequired { get; set; } = true;
    public int PasswordRotationDays { get; set; } = 90;
    public bool DetailedAuditLog { get; set; } = true;
}
