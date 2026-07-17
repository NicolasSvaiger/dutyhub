using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class AuditLogRepository : IAuditLogRepository
{
    private readonly AppDbContext _context;

    public AuditLogRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<AuditLog>> GetAllAsync()
    {
        return await _context.AuditLogs
            .Include(a => a.User)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync();
    }

    public async Task AddAsync(AuditLog auditLog)
    {
        _context.AuditLogs.Add(auditLog);
        await _context.SaveChangesAsync();
    }

    public async Task<AuditLogPageResult> GetPagedAsync(AuditLogFilter filter)
    {
        var query = _context.AuditLogs
            .Include(a => a.User)
            .AsQueryable();

        if (filter.FromUtc.HasValue) query = query.Where(a => a.Timestamp >= filter.FromUtc.Value);
        if (filter.ToUtc.HasValue) query = query.Where(a => a.Timestamp < filter.ToUtc.Value);
        if (filter.UserId.HasValue) query = query.Where(a => a.UserId == filter.UserId.Value);
        if (!string.IsNullOrWhiteSpace(filter.Module))
            query = query.Where(a => a.Module == filter.Module);
        if (!string.IsNullOrWhiteSpace(filter.Operation))
            query = query.Where(a => a.Operation == filter.Operation);
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var s = filter.Search.ToLower();
            query = query.Where(a =>
                a.Entity.ToLower().Contains(s) ||
                a.EntityId.ToLower().Contains(s) ||
                (a.Details != null && a.Details.ToLower().Contains(s)) ||
                (a.IpAddress != null && a.IpAddress.ToLower().Contains(s)));
        }

        var total = await query.CountAsync();

        var page = Math.Max(1, filter.Page);
        var size = Math.Clamp(filter.PageSize, 1, 200);
        var items = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync();

        return new AuditLogPageResult(items, total);
    }

    public async Task<IEnumerable<AuditLog>> GetInPeriodAsync(DateTime fromUtc, DateTime toUtc)
    {
        return await _context.AuditLogs
            .Include(a => a.User)
            .Where(a => a.Timestamp >= fromUtc && a.Timestamp < toUtc)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync();
    }
}
