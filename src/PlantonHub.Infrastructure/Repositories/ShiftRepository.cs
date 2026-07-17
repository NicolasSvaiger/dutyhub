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
                .ThenInclude(a => a.User)
            .FirstOrDefaultAsync(s => s.Id == id);
    }

    public async Task<IEnumerable<Shift>> GetAllAsync()
    {
        return await _context.Shifts
            .Include(s => s.ShiftAssignments)
                .ThenInclude(a => a.User)
            .ToListAsync();
    }

    public async Task<IEnumerable<Shift>> GetByClinicIdAsync(Guid clinicId)
    {
        return await _context.Shifts
            .Include(s => s.ShiftAssignments)
                .ThenInclude(a => a.User)
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

    public async Task DeleteAsync(Shift shift)
    {
        _context.Shifts.Remove(shift);
        await _context.SaveChangesAsync();
    }

    public async Task<bool> HasTimeOverlapForUserAsync(
        Guid userId, Guid excludeShiftId, DateTime date, TimeSpan startTime, TimeSpan endTime)
    {
        // Normalise to date-only for comparison
        var targetDate = date.Date;

        return await _context.ShiftAssignments
            .Where(sa => sa.UserId == userId && sa.ShiftId != excludeShiftId)
            .Include(sa => sa.Shift)
            .AnyAsync(sa =>
                sa.Shift.Date.Date == targetDate &&
                sa.Shift.StartTime < endTime &&
                sa.Shift.EndTime > startTime);
    }

    public async Task<IEnumerable<Shift>> GetInPeriodWithDetailsAsync(DateTime fromUtc, DateTime toUtc)
    {
        return await _context.Shifts
            .Where(s => s.Date >= fromUtc && s.Date < toUtc)
            .Include(s => s.ShiftAssignments)
                .ThenInclude(a => a.User)
            .Include(s => s.Attendances)
            .Include(s => s.Clinic)
                .ThenInclude(c => c.Contract)
                    .ThenInclude(ct => ct!.PublicOrgan)
            .ToListAsync();
    }
}
