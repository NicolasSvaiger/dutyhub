using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IPublicOrganRepository
{
    Task<PublicOrgan?> GetByIdAsync(Guid id);
    Task<IEnumerable<PublicOrgan>> GetAllAsync();
    Task<IEnumerable<PublicOrgan>> GetRootsAsync();
    Task<IEnumerable<PublicOrgan>> GetChildrenAsync(Guid parentId);
    Task AddAsync(PublicOrgan organ);
    Task UpdateAsync(PublicOrgan organ);
}
