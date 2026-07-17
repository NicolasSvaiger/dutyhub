using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface ISubstitutionRepository
{
    Task<Substitution?> GetByIdAsync(Guid id);
    Task<IEnumerable<Substitution>> GetAllAsync();

    /// <summary>Returns all substitutions for the given clinic ids.</summary>
    Task<IEnumerable<Substitution>> GetByClinicIdsAsync(IEnumerable<Guid> clinicIds);

    Task AddAsync(Substitution substitution);
    Task UpdateAsync(Substitution substitution);
}
