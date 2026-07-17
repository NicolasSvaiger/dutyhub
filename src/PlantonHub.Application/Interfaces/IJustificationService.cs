using PlantonHub.Application.DTOs.Justifications;

namespace PlantonHub.Application.Interfaces;

public interface IJustificationService
{
    /// <summary>
    /// AdminGlobal: retorna todas.
    /// AdminClinica: retorna somente as das UPAs autorizadas.
    /// </summary>
    Task<IEnumerable<JustificationResponse>> GetAllAsync();

    Task<JustificationResponse?> GetByIdAsync(Guid id);

    Task<JustificationResponse> CreateAsync(CreateJustificationRequest request);

    /// <summary>Move de Pending → UnderAnalysis.</summary>
    Task<JustificationResponse> StartAnalysisAsync(Guid id);

    /// <summary>Responde (aprova ou reprova).</summary>
    Task<JustificationResponse> RespondAsync(Guid id, RespondJustificationRequest request);
}
