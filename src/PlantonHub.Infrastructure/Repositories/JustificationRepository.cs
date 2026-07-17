using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class JustificationRepository : IJustificationRepository
{
    private readonly AppDbContext _context;
    public JustificationRepository(AppDbContext context) => _context = context;

    public async Task<Justification?> GetByIdAsync(Guid id) =>
        await _context.Justifications
            .Include(j => j.Clinic)
            .Include(j => j.AbsentUser)
            .Include(j => j.RespondedByUser)
            .FirstOrDefaultAsync(j => j.Id == id);

    public async Task<IEnumerable<Justification>> GetAllAsync() =>
        await _context.Justifications
            .Include(j => j.Clinic)
            .Include(j => j.AbsentUser)
            .Include(j => j.RespondedByUser)
            .OrderByDescending(j => j.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<Justification>> GetByClinicIdsAsync(IEnumerable<Guid> clinicIds)
    {
        var ids = clinicIds.ToList();
        return await _context.Justifications
            .Include(j => j.Clinic)
            .Include(j => j.AbsentUser)
            .Include(j => j.RespondedByUser)
            .Where(j => ids.Contains(j.ClinicId))
            .OrderByDescending(j => j.CreatedAt)
            .ToListAsync();
    }

    public async Task<bool> ProtocolExistsAsync(string protocolNumber) =>
        await _context.Justifications.AnyAsync(j => j.ProtocolNumber == protocolNumber);

    public async Task AddAsync(Justification justification)
    {
        _context.Justifications.Add(justification);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Justification justification)
    {
        await _context.SaveChangesAsync();
    }
}
