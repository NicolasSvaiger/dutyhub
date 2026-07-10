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
            // Non-admin users: return every clinic they are authorized to work at
            // (multi-clinic support). The authorized set comes from the JWT claim.
            var authorized = _tenantService.GetAuthorizedClinicIds().ToList();
            if (authorized.Count == 0)
            {
                return Enumerable.Empty<ClinicResponse>();
            }

            var userId = _tenantService.GetCurrentUserId();
            var cacheKey = userId.HasValue
                ? CacheKeys.ClinicsForUser(userId.Value)
                : CacheKeys.Clinics(authorized[0]);

            var results = await _cacheService.GetOrSetAsync(
                cacheKey,
                async () =>
                {
                    var list = new List<ClinicResponse>();
                    foreach (var id in authorized)
                    {
                        var clinic = await _clinicRepository.GetByIdAsync(id);
                        if (clinic is not null)
                        {
                            list.Add(MapToResponse(clinic));
                        }
                    }
                    return list;
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
