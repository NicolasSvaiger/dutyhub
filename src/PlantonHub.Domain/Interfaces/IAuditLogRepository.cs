using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IAuditLogRepository
{
    Task<IEnumerable<AuditLog>> GetAllAsync();
    Task AddAsync(AuditLog auditLog);
}
