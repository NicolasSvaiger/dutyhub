using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class PublicOrganRepository : IPublicOrganRepository
{
    private readonly AppDbContext _context;
    public PublicOrganRepository(AppDbContext context) => _context = context;

    public async Task<PublicOrgan?> GetByIdAsync(Guid id) =>
        await _context.PublicOrgans
            .Include(p => p.Parent)
            .Include(p => p.Children)
            .FirstOrDefaultAsync(p => p.Id == id);

    public async Task<IEnumerable<PublicOrgan>> GetAllAsync() =>
        await _context.PublicOrgans
            .Include(p => p.Parent)
            .Include(p => p.Children)
            .OrderBy(p => p.Name)
            .ToListAsync();

    public async Task<IEnumerable<PublicOrgan>> GetRootsAsync() =>
        await _context.PublicOrgans
            .Include(p => p.Children)
            .Where(p => p.ParentId == null)
            .OrderBy(p => p.Name)
            .ToListAsync();

    public async Task<IEnumerable<PublicOrgan>> GetChildrenAsync(Guid parentId) =>
        await _context.PublicOrgans
            .Where(p => p.ParentId == parentId)
            .OrderBy(p => p.Name)
            .ToListAsync();

    public async Task AddAsync(PublicOrgan organ)
    {
        _context.PublicOrgans.Add(organ);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(PublicOrgan organ)
    {
        _context.PublicOrgans.Update(organ);
        await _context.SaveChangesAsync();
    }
}
