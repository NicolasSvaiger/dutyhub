using PlantonHub.Application.DTOs.PublicOrgans;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class PublicOrganService : IPublicOrganService
{
    private readonly IPublicOrganRepository _repo;

    public PublicOrganService(IPublicOrganRepository repo) => _repo = repo;

    public async Task<IEnumerable<PublicOrganResponse>> GetAllAsync()
    {
        var organs = await _repo.GetAllAsync();
        return organs.Select(MapToResponse);
    }

    public async Task<PublicOrganResponse?> GetByIdAsync(Guid id)
    {
        var organ = await _repo.GetByIdAsync(id);
        return organ is null ? null : MapToResponse(organ);
    }

    private static PublicOrganResponse MapToResponse(PublicOrgan organ) => new()
    {
        Id = organ.Id,
        Name = organ.Name,
        Acronym = organ.Acronym,
        Cnpj = organ.Cnpj,
        Department = organ.Department,
        City = organ.City,
        State = organ.State,
        ContactName = organ.ContactName,
        ContactEmail = organ.ContactEmail,
        ContactPhone = organ.ContactPhone,
        ParentId = organ.ParentId,
        ParentName = organ.Parent?.Name,
        IsActive = organ.IsActive,
        CreatedAt = organ.CreatedAt,
        Children = organ.Children.Select(MapToResponse).ToList(),
    };
}
