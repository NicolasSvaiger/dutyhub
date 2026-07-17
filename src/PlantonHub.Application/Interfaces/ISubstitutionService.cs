using PlantonHub.Application.DTOs.Substitutions;

namespace PlantonHub.Application.Interfaces;

public interface ISubstitutionService
{
    /// <summary>
    /// AdminGlobal: returns all substitutions.
    /// AdminClinica: returns only substitutions for their authorized clinics.
    /// </summary>
    Task<IEnumerable<SubstitutionResponse>> GetAllAsync();

    Task<SubstitutionResponse?> GetByIdAsync(Guid id);

    Task<SubstitutionResponse> CreateAsync(CreateSubstitutionRequest request);

    /// <summary>Assigns (or replaces) the substitute for a pending/confirmed substitution.</summary>
    Task<SubstitutionResponse> AssignSubstituteAsync(Guid id, AssignSubstituteRequest request);

    Task<SubstitutionResponse> CancelAsync(Guid id);
}
