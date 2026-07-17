using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class AttendanceRepository : IAttendanceRepository
{
    private readonly AppDbContext _context;

    public AttendanceRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Attendance?> GetByIdAsync(Guid id)
    {
        return await _context.Attendances
            .FirstOrDefaultAsync(a => a.Id == id);
    }

    public async Task<Attendance?> GetByUserAndShiftAsync(Guid userId, Guid shiftId)
    {
        return await _context.Attendances
            .FirstOrDefaultAsync(a => a.UserId == userId && a.ShiftId == shiftId);
    }

    public async Task<IEnumerable<Attendance>> GetHistoryByUserAndClinicAsync(Guid userId, Guid clinicId)
    {
        return await _context.Attendances
            .Where(a => a.UserId == userId && a.ClinicId == clinicId)
            .OrderByDescending(a => a.CheckInTime)
            .ToListAsync();
    }

    public async Task<IEnumerable<Attendance>> GetActiveByUserAndClinicAsync(Guid userId, Guid clinicId)
    {
        return await _context.Attendances
            .Where(a => a.UserId == userId && a.ClinicId == clinicId && a.CheckOutTime == null)
            .OrderByDescending(a => a.CheckInTime)
            .ToListAsync();
    }

    public async Task<IEnumerable<Attendance>> GetByClinicAndDateRangeAsync(Guid clinicId, DateTime fromUtc, DateTime toUtc)
    {
        return await _context.Attendances
            .Where(a => a.ClinicId == clinicId && a.CheckInTime >= fromUtc && a.CheckInTime < toUtc)
            .ToListAsync();
    }

    public async Task AddAsync(Attendance attendance)
    {
        _context.Attendances.Add(attendance);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(Attendance attendance)
    {
        _context.Attendances.Update(attendance);
        await _context.SaveChangesAsync();
    }

    public async Task<bool> HasActiveCheckInAsync(Guid userId, Guid shiftId)
    {
        return await _context.Attendances
            .AnyAsync(a => a.UserId == userId && a.ShiftId == shiftId && a.CheckOutTime == null);
    }

    public async Task<bool> HasAnyActiveCheckInAsync(Guid userId)
    {
        return await _context.Attendances
            .AnyAsync(a => a.UserId == userId && a.CheckOutTime == null);
    }

    public async Task<bool> ExistsByLocalEventIdAsync(Guid localEventId, Guid userId, string deviceId)
    {
        return await _context.Attendances
            .AnyAsync(a => a.LocalEventId == localEventId
                        && a.UserId == userId
                        && a.CheckInDeviceId == deviceId);
    }

    public async Task<IEnumerable<string>> GetKnownDeviceIdsAsync(Guid userId, CancellationToken ct = default)
    {
        var checkInDevices = await _context.Attendances
            .Where(a => a.UserId == userId && a.CheckInDeviceId != null && a.CheckInDeviceId != "")
            .Select(a => a.CheckInDeviceId)
            .Distinct()
            .ToListAsync(ct);

        var checkOutDevices = await _context.Attendances
            .Where(a => a.UserId == userId && a.CheckOutDeviceId != null && a.CheckOutDeviceId != "")
            .Select(a => a.CheckOutDeviceId!)
            .Distinct()
            .ToListAsync(ct);

        return checkInDevices
            .Union(checkOutDevices, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
