using PlantonHub.Application.DTOs.PublicOrgans;

namespace PlantonHub.Application.Interfaces;

public interface IPublicOrganService
{
    Task<IEnumerable<PublicOrganResponse>> GetAllAsync();
    Task<PublicOrganResponse?> GetByIdAsync(Guid id);
}
