using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class SettingsRepository : ISettingsRepository
{
    private readonly AppDbContext _context;

    public SettingsRepository(AppDbContext context) => _context = context;

    public async Task<SystemSettings> GetAsync()
    {
        var settings = await _context.SystemSettings
            .FirstOrDefaultAsync(s => s.Id == SystemSettings.SingletonId);

        if (settings is null)
        {
            // Auto-create the singleton row with defaults
            settings = new SystemSettings { Id = SystemSettings.SingletonId };
            _context.SystemSettings.Add(settings);
            await _context.SaveChangesAsync();
        }

        return settings;
    }

    public async Task SaveAsync(SystemSettings settings)
    {
        var exists = await _context.SystemSettings
            .AnyAsync(s => s.Id == settings.Id);

        if (exists)
            _context.SystemSettings.Update(settings);
        else
            _context.SystemSettings.Add(settings);

        await _context.SaveChangesAsync();
    }
}
