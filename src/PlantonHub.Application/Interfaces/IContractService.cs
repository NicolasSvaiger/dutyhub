using PlantonHub.Application.DTOs.Contracts;

namespace PlantonHub.Application.Interfaces;

public interface IContractService
{
    /// <summary>
    /// AdminGlobal: returns all contracts.
    /// AdminClinica: returns only contracts that contain their authorized clinics.
    /// </summary>
    Task<IEnumerable<ContractResponse>> GetAllAsync();
    Task<ContractResponse?> GetByIdAsync(Guid id);
}
