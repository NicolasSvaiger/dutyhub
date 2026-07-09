using PlantonHub.Application.DTOs.Audit;

namespace PlantonHub.Application.Interfaces;

public interface IAuditService
{
    Task LogAsync(string operation, string entity, string entityId, string details);
    Task<IEnumerable<AuditLogResponse>> GetAllAsync();
}
