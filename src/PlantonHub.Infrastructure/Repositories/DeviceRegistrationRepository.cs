using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class DeviceRegistrationRepository : IDeviceRegistrationRepository
{
    private readonly AppDbContext _context;

    public DeviceRegistrationRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<DeviceRegistration?> GetActiveByUserIdAsync(Guid userId)
    {
        return await _context.DeviceRegistrations
            .FirstOrDefaultAsync(d => d.UserId == userId && d.IsActive);
    }

    public async Task AddAsync(DeviceRegistration registration)
    {
        _context.DeviceRegistrations.Add(registration);
        await _context.SaveChangesAsync();
    }

    public async Task DeactivateAllForUserAsync(Guid userId)
    {
        var registrations = await _context.DeviceRegistrations
            .Where(d => d.UserId == userId && d.IsActive)
            .ToListAsync();

        foreach (var r in registrations)
        {
            r.IsActive = false;
        }

        await _context.SaveChangesAsync();
    }

    public async Task AddUnlinkAuditAsync(DeviceUnlinkAudit audit)
    {
        _context.DeviceUnlinkAudits.Add(audit);
        await _context.SaveChangesAsync();
    }

    public async Task<IEnumerable<DeviceUnlinkAudit>> GetUnlinkHistoryAsync(Guid userId)
    {
        return await _context.DeviceUnlinkAudits
            .Where(a => a.UserId == userId)
            .OrderByDescending(a => a.UnlinkedAt)
            .ToListAsync();
    }
}
