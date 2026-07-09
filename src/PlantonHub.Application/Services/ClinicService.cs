using PlantonHub.Application.Constants;
using PlantonHub.Application.DTOs.Clinics;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class ClinicService : IClinicService
{
    private readonly IClinicRepository _clinicRepository;
    private readonly ITenantService _tenantService;
    private readonly ICacheService _cacheService;

    public ClinicService(
        IClinicRepository clinicRepository,
        ITenantService tenantService,
        ICacheService cacheService)
    {
        _clinicRepository = clinicRepository;
        _tenantService = tenantService;
        _cacheService = cacheService;
    }

    public async Task<IEnumerable<ClinicResponse>> GetAllAsync()
    {
        if (_tenantService.IsAdminGlobal())
        {
            var results = await _cacheService.GetOrSetAsync(
                CacheKeys.ClinicsAll(),
                async () =>
                {
                    var clinics = await _clinicRepository.GetAllAsync();
                    return clinics.Select(MapToResponse).ToList();
                });

            return results ?? Enumerable.Empty<ClinicResponse>();
        }
        else
        {
            var clinicId = _tenantService.GetCurrentClinicId();
            if (clinicId is null)
            {
                return Enumerable.Empty<ClinicResponse>();
            }

            var results = await _cacheService.GetOrSetAsync(
                CacheKeys.Clinics(clinicId.Value),
                async () =>
                {
                    var clinic = await _clinicRepository.GetByIdAsync(clinicId.Value);
                    return clinic is not null
                        ? new List<ClinicResponse> { MapToResponse(clinic) }
                        : new List<ClinicResponse>();
                });

            return results ?? Enumerable.Empty<ClinicResponse>();
        }
    }

    public async Task<ClinicResponse> CreateAsync(CreateClinicRequest request)
    {
        if (!_tenantService.IsAdminGlobal())
        {
            throw new ForbiddenException("Only AdminGlobal can create clinics.");
        }

        var clinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Address = request.Address,
            Phone = request.Phone,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        await _clinicRepository.AddAsync(clinic);

        // Invalidate all clinic-related cache entries
        await _cacheService.RemoveByPrefixAsync("clinics:");

        return MapToResponse(clinic);
    }

    private static ClinicResponse MapToResponse(Clinic clinic)
    {
        return new ClinicResponse
        {
            Id = clinic.Id,
            Name = clinic.Name,
            Address = clinic.Address,
            Phone = clinic.Phone,
            IsActive = clinic.IsActive,
            CreatedAt = clinic.CreatedAt
        };
    }
}
