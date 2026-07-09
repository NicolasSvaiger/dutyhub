using PlantonHub.Application.DTOs.Audit;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class AuditService : IAuditService
{
    private readonly IAuditLogRepository _auditLogRepository;
    private readonly ITenantService _tenantService;

    public AuditService(
        IAuditLogRepository auditLogRepository,
        ITenantService tenantService)
    {
        _auditLogRepository = auditLogRepository;
        _tenantService = tenantService;
    }

    public async Task LogAsync(string operation, string entity, string entityId, string details)
    {
        var userId = _tenantService.GetCurrentUserId() ?? Guid.Empty;

        var auditLog = new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Timestamp = DateTime.UtcNow,
            Operation = operation,
            Entity = entity,
            EntityId = entityId,
            Details = details
        };

        await _auditLogRepository.AddAsync(auditLog);
    }

    public async Task<IEnumerable<AuditLogResponse>> GetAllAsync()
    {
        if (!_tenantService.IsAdminGlobal())
        {
            throw new ForbiddenException("Only AdminGlobal can access audit logs.");
        }

        var logs = await _auditLogRepository.GetAllAsync();

        return logs
            .OrderByDescending(l => l.Timestamp)
            .Select(MapToResponse);
    }

    private static AuditLogResponse MapToResponse(AuditLog log)
    {
        return new AuditLogResponse
        {
            Id = log.Id,
            UserId = log.UserId,
            Timestamp = log.Timestamp,
            Operation = log.Operation,
            Entity = log.Entity,
            EntityId = log.EntityId,
            Details = log.Details
        };
    }
}
