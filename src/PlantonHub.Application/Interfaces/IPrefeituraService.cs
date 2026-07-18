using PlantonHub.Application.DTOs.Prefeitura;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Portal Prefeitura — reads agregados sobre o escopo do gestor logado.
/// Todo método é filtrado implicitamente por
/// <c>ITenantService.GetCurrentPublicOrganId()</c> + descendentes na
/// hierarquia (design.md § D3). Read-only na 7B.1; a mutação
/// <c>NotifyOsAboutAbsenceAsync</c> entra na 7B.2 e o export PDF/Excel
/// na 7B.2 também. Sprint 7B.3 traz os property/integration tests.
/// </summary>
public interface IPrefeituraService
{
    /// <summary>KPIs de hoje + resumo operacional + últimos alertas.</summary>
    Task<PrefeituraDashboardResponse> GetDashboardAsync(CancellationToken ct = default);

    /// <summary>Métricas agregadas por período — cards da tela KPIs.</summary>
    Task<PrefeituraKpisResponse> GetKpisAsync(DateTime from, DateTime to, CancellationToken ct = default);

    /// <summary>UPAs cobertas pelos contratos ativos do escopo do gestor.</summary>
    Task<IReadOnlyList<PrefeituraClinicItem>> GetClinicsAsync(CancellationToken ct = default);

    /// <summary>Escalas planejadas no período. Filtro opcional por UPA.</summary>
    Task<IReadOnlyList<PrefeituraShiftItem>> GetShiftsAsync(
        DateTime from,
        DateTime to,
        Guid? clinicId = null,
        CancellationToken ct = default);

    /// <summary>Frequência previsto x realizado, uma linha por (UPA, dia).</summary>
    Task<IReadOnlyList<PrefeituraFrequencyItem>> GetFrequencyAsync(
        DateTime from,
        DateTime to,
        Guid? clinicId = null,
        CancellationToken ct = default);

    /// <summary>Ausências e/ou atrasos no período. Filtro opcional pelo tipo.</summary>
    Task<IReadOnlyList<PrefeituraAbsenceItem>> GetAbsencesAsync(
        DateTime from,
        DateTime to,
        string? type = null,
        CancellationToken ct = default);

    /// <summary>Timeline paginada de eventos no escopo.</summary>
    Task<PrefeituraHistoryPage> GetHistoryAsync(
        DateTime from,
        DateTime to,
        string? type = null,
        string? search = null,
        int page = 1,
        int pageSize = 30,
        CancellationToken ct = default);

    /// <summary>Snapshot ao vivo das UPAs (Realtime + TV mode).</summary>
    Task<PrefeituraRealtimeResponse> GetRealtimeAsync(CancellationToken ct = default);
}
