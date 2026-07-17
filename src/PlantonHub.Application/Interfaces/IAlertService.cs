using PlantonHub.Application.DTOs.Alerts;

namespace PlantonHub.Application.Interfaces;

public interface IAlertService
{
    /// <summary>Lista alertas com escopo por tenant (AdminGlobal vê todos; AdminClinica só das suas UPAs + globais).</summary>
    Task<IEnumerable<AlertResponse>> GetAllAsync();

    Task<AlertResponse?> GetByIdAsync(Guid id);

    Task<AlertsSummaryResponse> GetSummaryAsync();

    Task<AlertResponse> CreateAsync(CreateAlertRequest request);

    /// <summary>Marca um alerta como resolvido.</summary>
    Task<AlertResponse> ResolveAsync(Guid id, ResolveAlertRequest? request = null);

    /// <summary>Marca todos os alertas abertos (respeitando o tenant) como resolvidos.</summary>
    Task<int> ResolveAllAsync();
}
