using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class ClinicRepository : IClinicRepository
{
    private readonly AppDbContext _context;

    public ClinicRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Clinic?> GetByIdAsync(Guid id)
    {
        return await _context.Clinics
            .Include(c => c.ShiftTemplates)
            .FirstOrDefaultAsync(c => c.Id == id);
    }

    public async Task<IEnumerable<Clinic>> GetAllAsync()
    {
        return await _context.Clinics
            .Include(c => c.ShiftTemplates)
            .ToListAsync();
    }

    public async Task AddAsync(Clinic clinic)
    {
        _context.Clinics.Add(clinic);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Clinic clinic)
    {
        _context.Clinics.Update(clinic);
        await _context.SaveChangesAsync();
    }

    public async Task DeleteShiftTemplatesAsync(Guid clinicId)
    {
        var templates = await _context.ClinicShiftTemplates
            .Where(t => t.ClinicId == clinicId)
            .ToListAsync();
        if (templates.Count > 0)
        {
            _context.ClinicShiftTemplates.RemoveRange(templates);
            await _context.SaveChangesAsync();
        }
    }

    public async Task ReplaceShiftTemplatesAsync(Guid clinicId, IEnumerable<ClinicShiftTemplate> newTemplates)
    {
        // Delete existing in same context transaction
        var existing = await _context.ClinicShiftTemplates
            .Where(t => t.ClinicId == clinicId)
            .ToListAsync();

        if (existing.Count > 0)
            _context.ClinicShiftTemplates.RemoveRange(existing);

        // Add new ones directly — no need to go through Clinic navigation
        await _context.ClinicShiftTemplates.AddRangeAsync(newTemplates);

        await _context.SaveChangesAsync();
    }

    public async Task<bool> UserBelongsToClinicAsync(Guid userId, Guid clinicId)
    {
        return await _context.UserClinicRoles
            .AnyAsync(ucr => ucr.UserId == userId && ucr.ClinicId == clinicId);
    }
}
