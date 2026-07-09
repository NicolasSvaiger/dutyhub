using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class OfflineSyncAuditLogRepository : IOfflineSyncAuditLogRepository
{
    private readonly AppDbContext _context;

    public OfflineSyncAuditLogRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task AddAsync(OfflineSyncAuditLog auditLog)
    {
        _context.OfflineSyncAuditLogs.Add(auditLog);
        await _context.SaveChangesAsync();
    }

    public async Task<IEnumerable<OfflineSyncAuditLog>> GetByUserIdAsync(Guid userId)
    {
        return await _context.OfflineSyncAuditLogs
            .Where(a => a.UserId == userId)
            .OrderByDescending(a => a.ReceivedAtServer)
            .ToListAsync();
    }

    public async Task<IEnumerable<OfflineSyncAuditLog>> GetByClinicIdAsync(Guid clinicId)
    {
        return await _context.OfflineSyncAuditLogs
            .Where(a => a.ClinicId == clinicId)
            .OrderByDescending(a => a.ReceivedAtServer)
            .ToListAsync();
    }
}
