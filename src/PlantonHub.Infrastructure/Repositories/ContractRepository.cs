using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class ContractRepository : IContractRepository
{
    private readonly AppDbContext _context;
    public ContractRepository(AppDbContext context) => _context = context;

    public async Task<Contract?> GetByIdAsync(Guid id) =>
        await _context.Contracts
            .Include(c => c.PublicOrgan)
            .Include(c => c.Clinics)
            .FirstOrDefaultAsync(c => c.Id == id);

    public async Task<IEnumerable<Contract>> GetAllAsync() =>
        await _context.Contracts
            .Include(c => c.PublicOrgan)
            .Include(c => c.Clinics)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<Contract>> GetByClinicIdsAsync(IEnumerable<Guid> clinicIds)
    {
        var ids = clinicIds.ToList();
        return await _context.Contracts
            .Include(c => c.PublicOrgan)
            .Include(c => c.Clinics)
            .Where(c => c.Clinics.Any(cl => ids.Contains(cl.Id)))
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();
    }

    public async Task AddAsync(Contract contract)
    {
        _context.Contracts.Add(contract);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Contract contract)
    {
        _context.Contracts.Update(contract);
        await _context.SaveChangesAsync();
    }
}
