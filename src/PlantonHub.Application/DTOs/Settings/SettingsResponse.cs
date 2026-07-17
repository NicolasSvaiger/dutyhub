namespace PlantonHub.Application.DTOs.Settings;

public class ClinicToleranceDto
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public int? CheckInToleranceMinutes { get; set; }
}

public class NotifChannelDto
{
    public bool Email { get; set; }
    public bool Sms { get; set; }
    public bool Push { get; set; }
}

public class SettingsResponse
{
    // ── Tolerâncias ──────────────────────────────────────────────────────────
    public int CheckInToleranceMinutes { get; set; }
    public int AbsenceThresholdMinutes { get; set; }
    public int CheckInBlockAfterMinutes { get; set; }
    public bool NotifyOnAbsence { get; set; }
    public List<ClinicToleranceDto> ClinicTolerances { get; set; } = new();

    // ── Fusos ────────────────────────────────────────────────────────────────
    public string SystemTimezone { get; set; } = "America/Sao_Paulo (UTC-3)";
    public bool DaylightSavingAuto { get; set; } = true;

    // ── Notificações ─────────────────────────────────────────────────────────
    public Dictionary<string, NotifChannelDto> NotificationChannels { get; set; } = new();
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
