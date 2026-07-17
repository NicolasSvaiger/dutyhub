using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Interfaces;

public interface IClinicRepository
{
    Task<Clinic?> GetByIdAsync(Guid id);
    Task<IEnumerable<Clinic>> GetAllAsync();

    /// <summary>
    /// Batch fetch by primary key. Used to eliminate N+1 loops of GetByIdAsync
    /// per id (e.g. ClinicService.GetAllAsync for non-AdminGlobal). Includes
    /// the same graph as GetByIdAsync (ShiftTemplates + Contract + PublicOrgan).
    /// </summary>
    Task<IEnumerable<Clinic>> GetByIdsAsync(IEnumerable<Guid> ids);

    Task AddAsync(Clinic clinic);
    Task UpdateAsync(Clinic clinic);
    Task DeleteShiftTemplatesAsync(Guid clinicId);
    Task ReplaceShiftTemplatesAsync(Guid clinicId, IEnumerable<ClinicShiftTemplate> newTemplates);

    /// <summary>
    /// Checks if a user has any role assignment at the specified clinic.
    /// </summary>
    Task<bool> UserBelongsToClinicAsync(Guid userId, Guid clinicId);

    /// <summary>
    /// Returns all UserClinicRoles for clinics belonging to the given contract.
    /// Used to propagate roles when a new clinic is added to a contract.
    /// </summary>
    Task<IEnumerable<UserClinicRole>> GetRolesByContractAsync(Guid contractId);

    /// <summary>
    /// Adds a UserClinicRole if it doesn't already exist (idempotent).
    /// </summary>
    Task AddRoleIfNotExistsAsync(Guid userId, Guid clinicId, RoleType role);
}
