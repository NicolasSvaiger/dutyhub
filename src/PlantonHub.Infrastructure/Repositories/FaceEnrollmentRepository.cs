using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class FaceEnrollmentRepository : IFaceEnrollmentRepository
{
    private readonly AppDbContext _context;

    public FaceEnrollmentRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<FaceEnrollment>> GetActiveByUserIdAsync(Guid userId)
    {
        return await _context.FaceEnrollments
            .Where(f => f.UserId == userId && f.IsActive)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync();
    }

    public async Task<IEnumerable<FaceEnrollment>> GetAllByUserIdAsync(Guid userId)
    {
        return await _context.FaceEnrollments
            .Where(f => f.UserId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync();
    }

    public async Task<FaceEnrollment?> GetByIdAsync(Guid id)
    {
        return await _context.FaceEnrollments.FindAsync(id);
    }

    public async Task AddAsync(FaceEnrollment enrollment)
    {
        _context.FaceEnrollments.Add(enrollment);
        await _context.SaveChangesAsync();
    }

    public async Task DeactivateAllForUserAsync(Guid userId)
    {
        var enrollments = await _context.FaceEnrollments
            .Where(f => f.UserId == userId && f.IsActive)
            .ToListAsync();

        foreach (var e in enrollments)
        {
            e.IsActive = false;
        }

        await _context.SaveChangesAsync();
    }

    public async Task<bool> HasEnrollmentAsync(Guid userId)
    {
        return await _context.FaceEnrollments
            .AnyAsync(f => f.UserId == userId && f.IsActive);
    }
}
