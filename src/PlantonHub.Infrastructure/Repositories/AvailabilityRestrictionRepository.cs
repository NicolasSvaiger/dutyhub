using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class AvailabilityRestrictionRepository : IAvailabilityRestrictionRepository
{
    private readonly AppDbContext _context;

    public AvailabilityRestrictionRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<AvailabilityRestriction>> GetAllAsync()
    {
        return await _context.AvailabilityRestrictions
            .Include(r => r.User)
            .OrderByDescending(r => r.StartDate)
            .ToListAsync();
    }

    public async Task<IEnumerable<AvailabilityRestriction>> GetByUserIdsAsync(IEnumerable<Guid> userIds)
    {
        var ids = userIds.ToHashSet();
        if (ids.Count == 0) return Enumerable.Empty<AvailabilityRestriction>();

        return await _context.AvailabilityRestrictions
            .Include(r => r.User)
            .Where(r => ids.Contains(r.UserId))
            .OrderByDescending(r => r.StartDate)
            .ToListAsync();
    }

    public async Task<AvailabilityRestriction?> GetByIdAsync(Guid id)
    {
        return await _context.AvailabilityRestrictions
            .Include(r => r.User)
            .FirstOrDefaultAsync(r => r.Id == id);
    }

    public async Task AddAsync(AvailabilityRestriction restriction)
    {
        _context.AvailabilityRestrictions.Add(restriction);
        await _context.SaveChangesAsync();
    }

    public async Task DeleteAsync(AvailabilityRestriction restriction)
    {
        _context.AvailabilityRestrictions.Remove(restriction);
        await _context.SaveChangesAsync();
    }
}
