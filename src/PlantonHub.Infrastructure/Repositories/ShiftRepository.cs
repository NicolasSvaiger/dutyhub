using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class ShiftRepository : IShiftRepository
{
    private readonly AppDbContext _context;

    public ShiftRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Shift?> GetByIdAsync(Guid id)
    {
        return await _context.Shifts
            .Include(s => s.ShiftAssignments)
            .FirstOrDefaultAsync(s => s.Id == id);
    }

    public async Task<IEnumerable<Shift>> GetAllAsync()
    {
        return await _context.Shifts
            .Include(s => s.ShiftAssignments)
            .ToListAsync();
    }

    public async Task<IEnumerable<Shift>> GetByClinicIdAsync(Guid clinicId)
    {
        return await _context.Shifts
            .Include(s => s.ShiftAssignments)
            .Where(s => s.ClinicId == clinicId)
            .ToListAsync();
    }

    public async Task<IEnumerable<Shift>> GetByUserIdAsync(Guid userId)
    {
        return await _context.ShiftAssignments
            .Where(sa => sa.UserId == userId)
            .Include(sa => sa.Shift)
                .ThenInclude(s => s.ShiftAssignments)
            .Select(sa => sa.Shift)
            .ToListAsync();
    }

    public async Task AddAsync(Shift shift)
    {
        _context.Shifts.Add(shift);
        await _context.SaveChangesAsync();
    }

    public async Task AddAssignmentAsync(ShiftAssignment assignment)
    {
        _context.ShiftAssignments.Add(assignment);
        await _context.SaveChangesAsync();
    }

    public async Task<bool> AssignmentExistsAsync(Guid shiftId, Guid userId)
    {
        return await _context.ShiftAssignments
            .AnyAsync(sa => sa.ShiftId == shiftId && sa.UserId == userId);
    }
}
