using PlantonHub.Application.DTOs.Contracts;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class ContractService : IContractService
{
    private readonly IContractRepository _contractRepo;
    private readonly ITenantService _tenantService;

    public ContractService(IContractRepository contractRepo, ITenantService tenantService)
    {
        _contractRepo = contractRepo;
        _tenantService = tenantService;
    }

    public async Task<IEnumerable<ContractResponse>> GetAllAsync()
    {
        if (_tenantService.IsAdminGlobal())
        {
            var all = await _contractRepo.GetAllAsync();
            return all.Select(MapToResponse);
        }

        // AdminClinica: only contracts that contain their authorized clinics
        var authorizedClinicIds = _tenantService.GetAuthorizedClinicIds().ToList();
        if (authorizedClinicIds.Count == 0)
            return Enumerable.Empty<ContractResponse>();

        var contracts = await _contractRepo.GetByClinicIdsAsync(authorizedClinicIds);
        return contracts.Select(MapToResponse);
    }

    public async Task<ContractResponse?> GetByIdAsync(Guid id)
    {
        var contract = await _contractRepo.GetByIdAsync(id);
        if (contract is null) return null;

        // Scope check for non-admin
        if (!_tenantService.IsAdminGlobal())
        {
            var authorized = _tenantService.GetAuthorizedClinicIds().ToHashSet();
            var hasAccess = contract.Clinics.Any(c => authorized.Contains(c.Id));
            if (!hasAccess) return null;
        }

        return MapToResponse(contract);
    }

    private static ContractResponse MapToResponse(Contract c) => new()
    {
        Id = c.Id,
        ContractNumber = c.ContractNumber,
        PublicOrganId = c.PublicOrganId,
        PublicOrganName = c.PublicOrgan?.Name ?? "—",
        PublicOrganAcronym = c.PublicOrgan?.Acronym,
        MonthlyValue = c.MonthlyValue,
        StartDate = c.StartDate,
        EndDate = c.EndDate,
        MinSlaPercent = c.MinSlaPercent,
        Status = c.Status,
        Notes = c.Notes,
        CreatedAt = c.CreatedAt,
        Clinics = c.Clinics.Select(cl => new ContractClinicSummary
        {
            Id = cl.Id,
            Name = cl.Name,
            Address = cl.Address,
            IsActive = cl.IsActive,
        }).ToList(),
    };
}
