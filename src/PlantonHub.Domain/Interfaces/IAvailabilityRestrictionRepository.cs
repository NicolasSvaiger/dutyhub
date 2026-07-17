using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IAvailabilityRestrictionRepository
{
    /// <summary>Todas as restrições — ordenadas por usuário e depois pela data mais recente.</summary>
    Task<IEnumerable<AvailabilityRestriction>> GetAllAsync();

    /// <summary>Restrições apenas de um conjunto de usuários (scope por clínica no service).</summary>
    Task<IEnumerable<AvailabilityRestriction>> GetByUserIdsAsync(IEnumerable<Guid> userIds);

    Task<AvailabilityRestriction?> GetByIdAsync(Guid id);

    Task AddAsync(AvailabilityRestriction restriction);

    Task DeleteAsync(AvailabilityRestriction restriction);
}
