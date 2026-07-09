using PlantonHub.Application.DTOs.Clinics;

namespace PlantonHub.Application.Interfaces;

public interface IClinicService
{
    Task<IEnumerable<ClinicResponse>> GetAllAsync();
    Task<ClinicResponse> CreateAsync(CreateClinicRequest request);
}
