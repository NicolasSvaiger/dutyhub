using PlantonHub.Application.Constants;
using PlantonHub.Application.DTOs.Clinics;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
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
            var authorized = _tenantService.GetAuthorizedClinicIds().ToList();
            if (authorized.Count == 0)
                return Enumerable.Empty<ClinicResponse>();

            var userId = _tenantService.GetCurrentUserId();
            var cacheKey = userId.HasValue
                ? CacheKeys.ClinicsForUser(userId.Value)
                : CacheKeys.Clinics(authorized[0]);

            var results = await _cacheService.GetOrSetAsync(
                cacheKey,
                async () =>
                {
                    // Single query for the whole authorized set — avoids N+1
                    // that would issue one GetByIdAsync per authorized clinic
                    // (each with 3 Includes: ShiftTemplates + Contract + PublicOrgan).
                    var clinics = await _clinicRepository.GetByIdsAsync(authorized);
                    return clinics.Select(MapToResponse).ToList();
                });

            return results ?? Enumerable.Empty<ClinicResponse>();
        }
    }

    public async Task<ClinicResponse> CreateAsync(CreateClinicRequest request)
    {
        if (!_tenantService.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can create clinics.");

        var clinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Address = request.Address,
            Phone = request.Phone,
            IsActive = true,
            HasNursing = request.HasNursing,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            AllowedRadiusMeters = request.AllowedRadiusMeters,
            Capacity = request.Capacity,
            DoctorsPerShift = request.DoctorsPerShift,
            City = request.City,
            Neighborhood = request.Neighborhood,
            ZipCode = request.ZipCode,
            ContractId = request.ContractId,
            CreatedAt = DateTime.UtcNow
        };

        await _clinicRepository.AddAsync(clinic);

        // Propagate roles: if linked to a contract, give all existing AdminClinica
        // of that contract access to this new clinic automatically.
        if (request.ContractId.HasValue)
            await PropagateContractRolesAsync(clinic.Id, request.ContractId.Value);

        await _cacheService.RemoveByPrefixAsync("clinics:");

        return MapToResponse(clinic);
    }

    public async Task<ClinicResponse> UpdateAsync(Guid id, UpdateClinicRequest request)
    {
        if (!_tenantService.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can update clinics.");

        var clinic = await _clinicRepository.GetByIdAsync(id)
            ?? throw new NotFoundException($"Clinic {id} not found.");

        clinic.Name = request.Name;
        clinic.Address = request.Address;
        clinic.Phone = request.Phone;
        clinic.IsActive = request.IsActive;
        clinic.HasNursing = request.HasNursing;
        clinic.Latitude = request.Latitude;
        clinic.Longitude = request.Longitude;
        clinic.AllowedRadiusMeters = request.AllowedRadiusMeters;
        clinic.Capacity = request.Capacity;
        clinic.DoctorsPerShift = request.DoctorsPerShift;
        clinic.City = request.City;
        clinic.Neighborhood = request.Neighborhood;
        clinic.ZipCode = request.ZipCode;
        clinic.ContractId = request.ContractId;

        await _clinicRepository.UpdateAsync(clinic);

        // Propagate roles: if ContractId changed (or was set), give all existing
        // AdminClinica of that contract access to this clinic automatically.
        if (request.ContractId.HasValue)
            await PropagateContractRolesAsync(clinic.Id, request.ContractId.Value);

        await _cacheService.RemoveByPrefixAsync("clinics:");

        return MapToResponse(clinic);
    }

    public async Task<ClinicResponse> ToggleStatusAsync(Guid id)
    {
        if (!_tenantService.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can toggle clinic status.");

        var clinic = await _clinicRepository.GetByIdAsync(id)
            ?? throw new NotFoundException($"Clinic {id} not found.");

        clinic.IsActive = !clinic.IsActive;
        await _clinicRepository.UpdateAsync(clinic);
        await _cacheService.RemoveByPrefixAsync("clinics:");

        return MapToResponse(clinic);
    }

    public async Task<ClinicResponse> UpsertShiftTemplatesAsync(Guid id, UpsertShiftTemplatesRequest request)
    {
        if (!_tenantService.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can manage shift templates.");

        // Verify clinic exists
        var clinic = await _clinicRepository.GetByIdAsync(id)
            ?? throw new NotFoundException($"Clinic {id} not found.");

        // Build new template entities
        var newTemplates = request.Templates.Select((t, i) => new Domain.Entities.ClinicShiftTemplate
        {
            Id = Guid.NewGuid(),
            ClinicId = id,
            Name = t.Name,
            StartTime = TimeSpan.Parse(t.StartTime),
            EndTime = TimeSpan.Parse(t.EndTime),
            RequiredStaff = t.RequiredStaff > 0 ? t.RequiredStaff : 1,
            DisplayOrder = t.DisplayOrder > 0 ? t.DisplayOrder : i + 1,
            ProfessionalType = (Domain.Enums.ProfessionalType)t.ProfessionalType,
        }).ToList();

        // Replace in single context operation — delete old + insert new atomically
        await _clinicRepository.ReplaceShiftTemplatesAsync(id, newTemplates);
        await _cacheService.RemoveByPrefixAsync("clinics:");

        // Re-fetch with updated templates for response
        clinic = await _clinicRepository.GetByIdAsync(id)!;
        return MapToResponse(clinic!);
    }

    public async Task<IEnumerable<NearestClinicResponse>> GetNearestAsync(double latitude, double longitude, int limit = 5)
    {
        var authorizedIds = _tenantService.GetAuthorizedClinicIds().ToList();
        if (authorizedIds.Count == 0)
            return Enumerable.Empty<NearestClinicResponse>();

        var clinics = new List<Clinic>();
        foreach (var id in authorizedIds)
        {
            var clinic = await _clinicRepository.GetByIdAsync(id);
            if (clinic is not null && clinic.IsActive && clinic.Latitude.HasValue && clinic.Longitude.HasValue)
                clinics.Add(clinic);
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
    /// When a clinic is added or linked to a contract, automatically propagate
    /// AdminClinica roles from existing clinics in that contract to the new clinic.
    /// This ensures AdminClinica users don't need to be manually re-assigned.
    /// </summary>
    private async Task PropagateContractRolesAsync(Guid newClinicId, Guid contractId)
    {
        var existingRoles = await _clinicRepository.GetRolesByContractAsync(contractId);

        // Only propagate AdminClinica roles — not Medico/Enfermeiro/Tecnico
        var adminRoles = existingRoles
            .Where(r => r.Role == RoleType.AdminClinica)
            .GroupBy(r => r.UserId)
            .Select(g => g.First())
            .ToList();

        foreach (var role in adminRoles)
            await _clinicRepository.AddRoleIfNotExistsAsync(role.UserId, newClinicId, RoleType.AdminClinica);
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
            HasNursing = clinic.HasNursing,
            CreatedAt = clinic.CreatedAt,
            Latitude = clinic.Latitude,
            Longitude = clinic.Longitude,
            AllowedRadiusMeters = clinic.AllowedRadiusMeters,
            Capacity = clinic.Capacity,
            DoctorsPerShift = clinic.DoctorsPerShift,
            City = clinic.City,
            Neighborhood = clinic.Neighborhood,
            ZipCode = clinic.ZipCode,
            ContractId = clinic.ContractId,
            ShiftTemplates = (clinic.ShiftTemplates ?? new List<ClinicShiftTemplate>())
                .OrderBy(t => t.ProfessionalType).ThenBy(t => t.DisplayOrder)
                .Select(t => new ShiftTemplateResponse
                {
                    Id = t.Id,
                    Name = t.Name,
                    StartTime = t.StartTime,
                    EndTime = t.EndTime,
                    RequiredStaff = t.RequiredStaff,
                    DisplayOrder = t.DisplayOrder,
                    ProfessionalType = t.ProfessionalType.ToString()
                }).ToList()
        };
    }

    public static double HaversineDistance(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371000;
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
