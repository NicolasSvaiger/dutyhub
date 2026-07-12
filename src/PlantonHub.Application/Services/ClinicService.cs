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

    public async Task<IEnumerable<NearestClinicResponse>> GetNearestAsync(double latitude, double longitude, int limit = 5)
    {
        // Get clinics the user is authorized to check-in at
        var authorizedIds = _tenantService.GetAuthorizedClinicIds().ToList();
        if (authorizedIds.Count == 0)
            return Enumerable.Empty<NearestClinicResponse>();

        var clinics = new List<Clinic>();
        foreach (var id in authorizedIds)
        {
            var clinic = await _clinicRepository.GetByIdAsync(id);
            if (clinic is not null && clinic.IsActive && clinic.Latitude.HasValue && clinic.Longitude.HasValue)
            {
                clinics.Add(clinic);
            }
        }

        return clinics
            .Select(c =>
            {
                var distance = HaversineDistance(latitude, longitude, c.Latitude!.Value, c.Longitude!.Value);
                var allowedRadius = c.AllowedRadiusMeters ?? 500;
                return new NearestClinicResponse
                {
                    Id = c.Id,
                    Name = c.Name,
                    Address = c.Address,
                    Latitude = c.Latitude,
                    Longitude = c.Longitude,
                    DistanceMeters = distance,
                    WithinRadius = distance <= allowedRadius,
                };
            })
            .OrderBy(c => c.DistanceMeters)
            .Take(limit)
            .ToList();
    }

    /// <summary>
    /// Haversine formula: calculates distance in meters between two lat/lng points.
    /// </summary>
    public static double HaversineDistance(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371000; // Earth radius in meters
        var dLat = ToRadians(lat2 - lat1);
        var dLon = ToRadians(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) *
                Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return R * c;
    }

    private static double ToRadians(double deg) => deg * Math.PI / 180.0;
}
