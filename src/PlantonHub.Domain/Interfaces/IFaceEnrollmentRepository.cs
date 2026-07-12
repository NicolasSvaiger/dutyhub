using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IFaceEnrollmentRepository
{
    Task<IEnumerable<FaceEnrollment>> GetActiveByUserIdAsync(Guid userId);
    Task<IEnumerable<FaceEnrollment>> GetAllByUserIdAsync(Guid userId);
    Task<FaceEnrollment?> GetByIdAsync(Guid id);
    Task AddAsync(FaceEnrollment enrollment);
    Task DeactivateAllForUserAsync(Guid userId);
    Task<bool> HasEnrollmentAsync(Guid userId);
}
