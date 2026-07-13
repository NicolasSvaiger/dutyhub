using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface ISettingsRepository
{
    Task<SystemSettings> GetAsync();
    Task SaveAsync(SystemSettings settings);
}
