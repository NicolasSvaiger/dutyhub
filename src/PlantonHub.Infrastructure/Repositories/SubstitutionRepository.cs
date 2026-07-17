using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class SubstitutionRepository : ISubstitutionRepository
{
    private readonly AppDbContext _context;
    public SubstitutionRepository(AppDbContext context) => _context = context;

    public async Task<Substitution?> GetByIdAsync(Guid id) =>
        await _context.Substitutions
            .Include(s => s.Clinic)
            .Include(s => s.AbsentUser)
            .Include(s => s.SubstituteUser)
            .FirstOrDefaultAsync(s => s.Id == id);

    public async Task<IEnumerable<Substitution>> GetAllAsync() =>
        await _context.Substitutions
            .Include(s => s.Clinic)
            .Include(s => s.AbsentUser)
            .Include(s => s.SubstituteUser)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<Substitution>> GetByClinicIdsAsync(IEnumerable<Guid> clinicIds)
    {
        var ids = clinicIds.ToList();
        return await _context.Substitutions
            .Include(s => s.Clinic)
            .Include(s => s.AbsentUser)
            .Include(s => s.SubstituteUser)
            .Where(s => ids.Contains(s.ClinicId))
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync();
    }

    public async Task AddAsync(Substitution substitution)
    {
        _context.Substitutions.Add(substitution);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Substitution substitution)
    {
        await _context.SaveChangesAsync();
    }
}
