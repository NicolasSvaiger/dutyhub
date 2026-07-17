using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class AlertRepository : IAlertRepository
{
    private readonly AppDbContext _context;
    public AlertRepository(AppDbContext context) => _context = context;

    public async Task<Alert?> GetByIdAsync(Guid id) =>
        await _context.Alerts
            .Include(a => a.Clinic)
            .Include(a => a.RelatedUser)
            .Include(a => a.ResolvedByUser)
            .FirstOrDefaultAsync(a => a.Id == id);

    public async Task<IEnumerable<Alert>> GetAllAsync() =>
        await _context.Alerts
            .Include(a => a.Clinic)
            .Include(a => a.RelatedUser)
            .Include(a => a.ResolvedByUser)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<Alert>> GetByClinicIdsAsync(IEnumerable<Guid> clinicIds, bool includeGlobal = true)
    {
        var ids = clinicIds.ToList();
        return await _context.Alerts
            .Include(a => a.Clinic)
            .Include(a => a.RelatedUser)
            .Include(a => a.ResolvedByUser)
            .Where(a =>
                (a.ClinicId.HasValue && ids.Contains(a.ClinicId.Value)) ||
                (includeGlobal && !a.ClinicId.HasValue))
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();
    }

    public async Task<bool> CodeExistsAsync(string code) =>
        await _context.Alerts.AnyAsync(a => a.Code == code);

    public async Task AddAsync(Alert alert)
    {
        _context.Alerts.Add(alert);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Alert alert)
    {
        await _context.SaveChangesAsync();
    }

    public async Task<int> ResolveAllAsync(IEnumerable<Guid>? clinicIds, Guid? resolvedByUserId, DateTime resolvedAt, bool globalScope)
    {
        IQueryable<Alert> query = _context.Alerts.Where(a => !a.IsResolved);

        if (!globalScope && clinicIds is not null)
        {
            var ids = clinicIds.ToList();
            query = query.Where(a =>
                (a.ClinicId.HasValue && ids.Contains(a.ClinicId.Value)) ||
                !a.ClinicId.HasValue);
        }

        var toResolve = await query.ToListAsync();
        foreach (var a in toResolve)
        {
            a.IsResolved = true;
            a.Level = Domain.Enums.AlertLevel.Resolved;
            a.ResolvedAt = resolvedAt;
            a.ResolvedByUserId = resolvedByUserId;
        }
        await _context.SaveChangesAsync();
        return toResolve.Count;
    }
}
