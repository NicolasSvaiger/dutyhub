using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class OfflineAttendanceEventRepository : IOfflineAttendanceEventRepository
{
    private readonly AppDbContext _context;

    public OfflineAttendanceEventRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task AddAsync(OfflineAttendanceEvent offlineEvent)
    {
        _context.OfflineAttendanceEvents.Add(offlineEvent);
        await _context.SaveChangesAsync();
    }

    public async Task<bool> ExistsAsync(Guid localEventId, Guid userId, string deviceId)
    {
        return await _context.OfflineAttendanceEvents
            .AnyAsync(e => e.LocalEventId == localEventId
                        && e.UserId == userId
                        && e.DeviceId == deviceId);
    }
}
