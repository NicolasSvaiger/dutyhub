using PlantonHub.Application.DTOs.Availability;

namespace PlantonHub.Application.Interfaces;

public interface IAvailabilityService
{
    /// <summary>
    /// Visão da tela "Disponibilidade": lista todos os profissionais visíveis
    /// para o admin logado com suas restrições e status computado.
    /// AdminGlobal vê todos; AdminClinica vê só quem tem role em suas clínicas.
    /// </summary>
    Task<IEnumerable<ProfessionalAvailabilityResponse>> GetProfessionalsAvailabilityAsync();

    Task<AvailabilityRestrictionResponse> CreateRestrictionAsync(CreateAvailabilityRestrictionRequest request);

    Task DeleteRestrictionAsync(Guid restrictionId);
}
