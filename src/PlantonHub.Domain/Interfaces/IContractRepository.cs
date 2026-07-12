using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IContractRepository
{
    Task<Contract?> GetByIdAsync(Guid id);
    Task<IEnumerable<Contract>> GetAllAsync();

    /// <summary>Returns all contracts that contain at least one of the given clinic ids.</summary>
    Task<IEnumerable<Contract>> GetByClinicIdsAsync(IEnumerable<Guid> clinicIds);

    Task AddAsync(Contract contract);
    Task UpdateAsync(Contract contract);
}
