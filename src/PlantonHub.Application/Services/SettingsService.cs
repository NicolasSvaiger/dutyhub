using System.Text.Json;
using PlantonHub.Application.DTOs.Settings;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class SettingsService : ISettingsService
{
    private readonly ISettingsRepository _settingsRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly ITenantService _tenant;

    private static readonly JsonSerializerOptions _json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public SettingsService(
        ISettingsRepository settingsRepo,
        IClinicRepository clinicRepo,
        ITenantService tenant)
    {
        _settingsRepo = settingsRepo;
        _clinicRepo = clinicRepo;
        _tenant = tenant;
    }

    public async Task<SettingsResponse> GetAsync()
    {
        var s = await _settingsRepo.GetAsync();
        var clinics = (await _clinicRepo.GetAllAsync()).ToList();

        // Deserialise notification channels JSON
        var channels = new Dictionary<string, NotifChannelDto>();
        if (!string.IsNullOrWhiteSpace(s.NotificationChannelsJson))
        {
            try
            {
                channels = JsonSerializer.Deserialize<Dictionary<string, NotifChannelDto>>(
                    s.NotificationChannelsJson, _json) ?? new();
            }
            catch { /* fallback to empty */ }
        }

        return new SettingsResponse
        {
            // Tolerâncias
            CheckInToleranceMinutes = s.CheckInToleranceMinutes,
            AbsenceThresholdMinutes = s.AbsenceThresholdMinutes,
            CheckInBlockAfterMinutes = s.CheckInBlockAfterMinutes,
            NotifyOnAbsence = s.NotifyOnAbsence,
            ClinicTolerances = clinics.Select(c => new ClinicToleranceDto
            {
                ClinicId = c.Id,
                ClinicName = c.Name,
                CheckInToleranceMinutes = c.CheckInToleranceMinutes,
            }).ToList(),

            // Fusos
            SystemTimezone = s.SystemTimezone,
            DaylightSavingAuto = s.DaylightSavingAuto,

            // Notificações
            NotificationChannels = channels,
            EmailSender = s.EmailSender,
            EmailSenderName = s.EmailSenderName,
            EmailCc = s.EmailCc,

            // Biometria
            BiometricConfidencePercent = s.BiometricConfidencePercent,
            BiometricMaxAttempts = s.BiometricMaxAttempts,
            BiometricAllowManualCheckin = s.BiometricAllowManualCheckin,
            BiometricLogFailedAttempt = s.BiometricLogFailedAttempt,
            AzureEndpoint = s.AzureEndpoint,
            AzureRegion = s.AzureRegion,

            // Sistema
            OrgName = s.OrgName,
            OrgCnpj = s.OrgCnpj,
            OrgEmail = s.OrgEmail,
            SessionTimeoutMinutes = s.SessionTimeoutMinutes,
            MfaRequired = s.MfaRequired,
            PasswordRotationDays = s.PasswordRotationDays,
            DetailedAuditLog = s.DetailedAuditLog,
        };
    }

    public async Task<SettingsResponse> UpdateAsync(UpdateSettingsRequest request)
    {
        if (!_tenant.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can update system settings.");

        var s = await _settingsRepo.GetAsync();

        // Tolerâncias
        s.CheckInToleranceMinutes = Math.Clamp(request.CheckInToleranceMinutes, 5, 120);
        s.AbsenceThresholdMinutes = Math.Clamp(request.AbsenceThresholdMinutes, 15, 480);
        s.CheckInBlockAfterMinutes = Math.Clamp(request.CheckInBlockAfterMinutes, 30, 720);
        s.NotifyOnAbsence = request.NotifyOnAbsence;

        // Fusos
        s.SystemTimezone = request.SystemTimezone ?? s.SystemTimezone;
        s.DaylightSavingAuto = request.DaylightSavingAuto;

        // Notificações
        if (request.NotificationChannels.Count > 0)
        {
            // Serialise channel map as JSON — compact, no nulls
            var dto = request.NotificationChannels.ToDictionary(
                kv => kv.Key,
                kv => new NotifChannelDto { Email = kv.Value.Email, Sms = kv.Value.Sms, Push = kv.Value.Push });
            s.NotificationChannelsJson = JsonSerializer.Serialize(dto, _json);
        }
        s.EmailSender = request.EmailSender ?? s.EmailSender;
        s.EmailSenderName = request.EmailSenderName ?? s.EmailSenderName;
        s.EmailCc = request.EmailCc ?? s.EmailCc;

        // Biometria
        s.BiometricConfidencePercent = Math.Clamp(request.BiometricConfidencePercent, 50, 99);
        s.BiometricMaxAttempts = Math.Clamp(request.BiometricMaxAttempts, 1, 10);
        s.BiometricAllowManualCheckin = request.BiometricAllowManualCheckin;
        s.BiometricLogFailedAttempt = request.BiometricLogFailedAttempt;
        if (!string.IsNullOrWhiteSpace(request.AzureEndpoint))
            s.AzureEndpoint = request.AzureEndpoint;
        s.AzureRegion = request.AzureRegion ?? s.AzureRegion;

        // Sistema
        if (!string.IsNullOrWhiteSpace(request.OrgName))
            s.OrgName = request.OrgName;
        s.OrgCnpj = request.OrgCnpj ?? s.OrgCnpj;
        s.OrgEmail = request.OrgEmail ?? s.OrgEmail;
        s.SessionTimeoutMinutes = request.SessionTimeoutMinutes;
        s.MfaRequired = request.MfaRequired;
        s.PasswordRotationDays = request.PasswordRotationDays;
        s.DetailedAuditLog = request.DetailedAuditLog;

        s.UpdatedAt = DateTime.UtcNow;
        await _settingsRepo.SaveAsync(s);

        // Per-clinic tolerance overrides
        foreach (var ct in request.ClinicTolerances)
        {
            var clinic = await _clinicRepo.GetByIdAsync(ct.ClinicId);
            if (clinic is null) continue;
            clinic.CheckInToleranceMinutes = ct.CheckInToleranceMinutes.HasValue
                ? Math.Clamp(ct.CheckInToleranceMinutes.Value, 5, 120)
                : null;
            await _clinicRepo.UpdateAsync(clinic);
        }

        return await GetAsync();
    }
}
