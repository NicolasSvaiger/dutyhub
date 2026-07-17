using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IJustificationRepository
{
    Task<Justification?> GetByIdAsync(Guid id);
    Task<IEnumerable<Justification>> GetAllAsync();
    Task<IEnumerable<Justification>> GetByClinicIdsAsync(IEnumerable<Guid> clinicIds);
    Task<bool> ProtocolExistsAsync(string protocolNumber);
    Task AddAsync(Justification justification);
    Task UpdateAsync(Justification justification);
}
