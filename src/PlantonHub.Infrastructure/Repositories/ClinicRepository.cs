using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
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
            .Include(c => c.Contract)
                .ThenInclude(ct => ct!.PublicOrgan)
            .FirstOrDefaultAsync(c => c.Id == id);
    }

    public async Task<IEnumerable<Clinic>> GetAllAsync()
    {
        return await _context.Clinics
            .Include(c => c.ShiftTemplates)
            .Include(c => c.Contract)
                .ThenInclude(ct => ct!.PublicOrgan)
            .ToListAsync();
    }

    public async Task AddAsync(Clinic clinic)
    {
        _context.Clinics.Add(clinic);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Clinic clinic)
    {
        // Explicitly mark as modified to ensure EF persists all scalar changes
        // including ContractId FK even when the navigation property isn't loaded.
        _context.Entry(clinic).State = EntityState.Modified;
        // Shift templates are managed separately via ReplaceShiftTemplatesAsync
        // — ignore them here to avoid trying to update/insert them again.
        foreach (var template in clinic.ShiftTemplates ?? new List<ClinicShiftTemplate>())
            _context.Entry(template).State = EntityState.Detached;
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

    public async Task<IEnumerable<UserClinicRole>> GetRolesByContractAsync(Guid contractId)
    {
        // All UserClinicRoles for clinics that belong to this contract
        return await _context.UserClinicRoles
            .Where(ucr => _context.Clinics
                .Any(c => c.Id == ucr.ClinicId && c.ContractId == contractId))
            .ToListAsync();
    }

    public async Task AddRoleIfNotExistsAsync(Guid userId, Guid clinicId, RoleType role)
    {
        var exists = await _context.UserClinicRoles
            .AnyAsync(ucr => ucr.UserId == userId && ucr.ClinicId == clinicId);
        if (!exists)
        {
            _context.UserClinicRoles.Add(new UserClinicRole
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ClinicId = clinicId,
                Role = role,
                AssignedAt = DateTime.UtcNow,
            });
            await _context.SaveChangesAsync();
        }
    }
}