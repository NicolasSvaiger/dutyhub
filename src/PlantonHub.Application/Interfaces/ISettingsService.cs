using PlantonHub.Application.DTOs.Settings;

namespace PlantonHub.Application.Interfaces;

public interface ISettingsService
{
    Task<SettingsResponse> GetAsync();
    Task<SettingsResponse> UpdateAsync(UpdateSettingsRequest request);
}
