using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IDeviceRegistrationRepository
{
    Task<DeviceRegistration?> GetActiveByUserIdAsync(Guid userId);
    Task AddAsync(DeviceRegistration registration);
    Task DeactivateAllForUserAsync(Guid userId);
    Task AddUnlinkAuditAsync(DeviceUnlinkAudit audit);
    Task<IEnumerable<DeviceUnlinkAudit>> GetUnlinkHistoryAsync(Guid userId);
}
