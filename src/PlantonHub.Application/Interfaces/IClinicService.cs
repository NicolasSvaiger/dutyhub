using PlantonHub.Application.DTOs.Clinics;

namespace PlantonHub.Application.Interfaces;

public interface IClinicService
{
    Task<IEnumerable<ClinicResponse>> GetAllAsync();
    Task<ClinicResponse> CreateAsync(CreateClinicRequest request);
    Task<ClinicResponse> UpdateAsync(Guid id, UpdateClinicRequest request);
    Task<ClinicResponse> ToggleStatusAsync(Guid id);
    Task<ClinicResponse> UpsertShiftTemplatesAsync(Guid id, UpsertShiftTemplatesRequest request);
    Task<IEnumerable<NearestClinicResponse>> GetNearestAsync(double latitude, double longitude, int limit = 5);
}
