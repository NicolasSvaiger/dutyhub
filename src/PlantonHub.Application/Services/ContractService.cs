using PlantonHub.Application.DTOs.Contracts;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class ContractService : IContractService
{
    private readonly IContractRepository _contractRepo;
    private readonly IPublicOrganRepository _organRepo;
    private readonly ITenantService _tenantService;

    public ContractService(
        IContractRepository contractRepo,
        IPublicOrganRepository organRepo,
        ITenantService tenantService)
    {
        _contractRepo = contractRepo;
        _organRepo = organRepo;
        _tenantService = tenantService;
    }

    public async Task<IEnumerable<ContractResponse>> GetAllAsync()
    {
        if (_tenantService.IsAdminGlobal())
        {
            var all = await _contractRepo.GetAllAsync();
            return all.Select(c => MapToResponse(c, null));
        }

        // AdminClinica: only contracts that contain their authorized clinics
        // Response only shows the clinics they manage — not others in the same contract
        var authorizedClinicIds = _tenantService.GetAuthorizedClinicIds().ToHashSet();
        if (authorizedClinicIds.Count == 0)
            return Enumerable.Empty<ContractResponse>();

        var contracts = await _contractRepo.GetByClinicIdsAsync(authorizedClinicIds);
        return contracts.Select(c => MapToResponse(c, authorizedClinicIds));
    }

    public async Task<ContractResponse?> GetByIdAsync(Guid id)
    {
        var contract = await _contractRepo.GetByIdAsync(id);
        if (contract is null) return null;

        if (_tenantService.IsAdminGlobal())
            return MapToResponse(contract, null);

        // Scope check for non-admin
        var authorized = _tenantService.GetAuthorizedClinicIds().ToHashSet();
        var hasAccess = contract.Clinics.Any(c => authorized.Contains(c.Id));
        if (!hasAccess) return null;

        // Only return the clinics this user manages
        return MapToResponse(contract, authorized);
    }

    public async Task<ContractResponse> CreateAsync(CreateContractRequest request)
    {
        if (!_tenantService.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can create contracts.");

        var now = DateTime.UtcNow;

        // Create the public organ
        var organ = new PublicOrgan
        {
            Id = Guid.NewGuid(),
            Name = request.OrganName,
            Acronym = request.OrganAcronym,
            Cnpj = request.OrganCnpj,
            Department = request.OrganDepartment,
            ContactName = request.OrganContactName,
            ContactEmail = request.OrganContactEmail,
            ContactPhone = request.OrganContactPhone,
            City = request.OrganCity,
            State = request.OrganState,
            IsActive = true,
            CreatedAt = now,
        };
        await _organRepo.AddAsync(organ);

        // Create the contract linked to the new organ
        var contract = new Contract
        {
            Id = Guid.NewGuid(),
            PublicOrganId = organ.Id,
            ContractNumber = request.ContractNumber,
            MonthlyValue = request.MonthlyValue,
            StartDate = DateTime.SpecifyKind(request.StartDate, DateTimeKind.Utc),
            EndDate = DateTime.SpecifyKind(request.EndDate, DateTimeKind.Utc),
            MinSlaPercent = request.MinSlaPercent,
            Status = request.Status,
            Notes = request.Notes,
            CreatedAt = now,
        };
        await _contractRepo.AddAsync(contract);

        // Re-fetch with navigation properties
        var created = await _contractRepo.GetByIdAsync(contract.Id);
        return MapToResponse(created!, null);
    }

    public async Task<ContractResponse> UpdateAsync(Guid id, UpdateContractRequest request)
    {
        if (!_tenantService.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can update contracts.");

        var contract = await _contractRepo.GetByIdAsync(id)
            ?? throw new NotFoundException($"Contract {id} not found.");

        // Update the linked public organ (already loaded via Include — same tracked instance)
        var organ = contract.PublicOrgan
            ?? await _organRepo.GetByIdAsync(contract.PublicOrganId)
            ?? throw new NotFoundException($"PublicOrgan {contract.PublicOrganId} not found.");

        organ.Name = request.OrganName;
        organ.Acronym = request.OrganAcronym;
        organ.Cnpj = request.OrganCnpj;
        organ.Department = request.OrganDepartment;
        organ.ContactName = request.OrganContactName;
        organ.ContactEmail = request.OrganContactEmail;
        organ.ContactPhone = request.OrganContactPhone;
        organ.City = request.OrganCity;
        organ.State = request.OrganState;

        // Update contract fields
        contract.ContractNumber = request.ContractNumber;
        contract.MonthlyValue = request.MonthlyValue;
        contract.StartDate = DateTime.SpecifyKind(request.StartDate, DateTimeKind.Utc);
        contract.EndDate = DateTime.SpecifyKind(request.EndDate, DateTimeKind.Utc);
        contract.MinSlaPercent = request.MinSlaPercent;
        contract.Status = request.Status;
        contract.Notes = request.Notes;

        // Save both in one shot via the contract repo (same DbContext — EF tracks organ changes too)
        await _contractRepo.UpdateAsync(contract);

        var updated = await _contractRepo.GetByIdAsync(id);
        return MapToResponse(updated!, null);
    }

    private static ContractResponse MapToResponse(Contract c, HashSet<Guid>? authorizedClinicIds) => new()
    {
        Id = c.Id,
        ContractNumber = c.ContractNumber,
        PublicOrganId = c.PublicOrganId,
        PublicOrganName = c.PublicOrgan?.Name ?? "—",
        PublicOrganAcronym = c.PublicOrgan?.Acronym,
        PublicOrganCnpj = c.PublicOrgan?.Cnpj,
        PublicOrganDepartment = c.PublicOrgan?.Department,
        PublicOrganContactName = c.PublicOrgan?.ContactName,
        PublicOrganContactEmail = c.PublicOrgan?.ContactEmail,
        PublicOrganContactPhone = c.PublicOrgan?.ContactPhone,
        PublicOrganCity = c.PublicOrgan?.City,
        PublicOrganState = c.PublicOrgan?.State,
        MonthlyValue = c.MonthlyValue,
        StartDate = c.StartDate,
        EndDate = c.EndDate,
        MinSlaPercent = c.MinSlaPercent,
        Status = c.Status,
        Notes = c.Notes,
        CreatedAt = c.CreatedAt,
        // If authorizedClinicIds is null (AdminGlobal) → show all clinics
        // If scoped (AdminClinica) → show only their clinics
        Clinics = c.Clinics
            .Where(cl => authorizedClinicIds == null || authorizedClinicIds.Contains(cl.Id))
            .Select(cl => new ContractClinicSummary
            {
                Id = cl.Id,
                Name = cl.Name,
                Address = cl.Address,
                IsActive = cl.IsActive,
            }).ToList(),
    };
}
