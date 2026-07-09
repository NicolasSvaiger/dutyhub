using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IOfflineSyncAuditLogRepository
{
    Task AddAsync(OfflineSyncAuditLog auditLog);
    Task<IEnumerable<OfflineSyncAuditLog>> GetByUserIdAsync(Guid userId);
    Task<IEnumerable<OfflineSyncAuditLog>> GetByClinicIdAsync(Guid clinicId);
}
