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
        var settings = await _settingsRepo.GetAsync();
        var clinics = (await _clinicRepo.GetAllAsync()).ToList();

        return new SettingsResponse
        {
            CheckInToleranceMinutes = settings.CheckInToleranceMinutes,
            AbsenceThresholdMinutes = settings.AbsenceThresholdMinutes,
            CheckInBlockAfterMinutes = settings.CheckInBlockAfterMinutes,
            NotifyOnAbsence = settings.NotifyOnAbsence,
            ClinicTolerances = clinics.Select(c => new ClinicToleranceDto
            {
                ClinicId = c.Id,
                ClinicName = c.Name,
                CheckInToleranceMinutes = c.CheckInToleranceMinutes,
            }).ToList(),
        };
    }

    public async Task<SettingsResponse> UpdateAsync(UpdateSettingsRequest request)
    {
        if (!_tenant.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can update system settings.");

        // Update global settings
        var settings = await _settingsRepo.GetAsync();
        settings.CheckInToleranceMinutes = Math.Clamp(request.CheckInToleranceMinutes, 5, 120);
        settings.AbsenceThresholdMinutes = Math.Clamp(request.AbsenceThresholdMinutes, 15, 480);
        settings.CheckInBlockAfterMinutes = Math.Clamp(request.CheckInBlockAfterMinutes, 30, 720);
        settings.NotifyOnAbsence = request.NotifyOnAbsence;
        settings.UpdatedAt = DateTime.UtcNow;
        await _settingsRepo.SaveAsync(settings);

        // Update per-clinic tolerances
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
