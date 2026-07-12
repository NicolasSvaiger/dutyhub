using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IClinicRepository
{
    Task<Clinic?> GetByIdAsync(Guid id);
    Task<IEnumerable<Clinic>> GetAllAsync();
    Task AddAsync(Clinic clinic);
    Task UpdateAsync(Clinic clinic);
    Task DeleteShiftTemplatesAsync(Guid clinicId);
    Task ReplaceShiftTemplatesAsync(Guid clinicId, IEnumerable<ClinicShiftTemplate> newTemplates);

    /// <summary>
    /// Checks if a user has any role assignment at the specified clinic.
    /// </summary>
    Task<bool> UserBelongsToClinicAsync(Guid userId, Guid clinicId);
}
