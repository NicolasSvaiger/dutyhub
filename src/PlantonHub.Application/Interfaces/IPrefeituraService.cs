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

    /// <summary>
    /// Grade semanal (UPA x dia x turno) — mock <c>op-escalas.html</c>.
    /// <paramref name="weekStart"/> é normalizado internamente pro início
    /// (domingo) da semana que contém a data informada. <paramref name="clinicId"/>
    /// obrigatório — 404 se fora do escopo do gestor.
    /// </summary>
    Task<PrefeituraWeeklyScheduleResponse> GetWeeklyScheduleAsync(
        Guid clinicId,
        DateTime weekStart,
        CancellationToken ct = default);

    /// <summary>Frequência previsto x realizado, uma linha por (UPA, dia).</summary>
    Task<IReadOnlyList<PrefeituraFrequencyItem>> GetFrequencyAsync(
        DateTime from,
        DateTime to,
        Guid? clinicId = null,
        CancellationToken ct = default);

    /// <summary>
    /// Frequência agregada por profissional — uma linha por médico com
    /// escalados/realizados/ausências/atrasos/% cumprimento no período.
    /// Ver <c>op-frequencia.html</c> § tabela "Frequência por Médico".
    /// </summary>
    Task<IReadOnlyList<PrefeituraFrequencyByDoctorItem>> GetFrequencyByDoctorAsync(
        DateTime from,
        DateTime to,
        Guid? clinicId = null,
        CancellationToken ct = default);

    /// <summary>
    /// Ausências e/ou atrasos no período. Filtro opcional pelo tipo.
    /// <paramref name="toleranceOverrideMinutes"/> permite o gestor simular
    /// uma tolerância diferente da configurada (slider da tela Atrasos) sem
    /// alterar a configuração real da clínica — só afeta o cálculo de
    /// "late" desta chamada. Ignorado quando null (usa a tolerância real).
    /// </summary>
    Task<IReadOnlyList<PrefeituraAbsenceItem>> GetAbsencesAsync(
        DateTime from,
        DateTime to,
        string? type = null,
        CancellationToken ct = default,
        int? toleranceOverrideMinutes = null);

    /// <summary>
    /// Timeline de plantões de uma UPA específica com KPIs agregados
    /// (total/entradas/saídas/atrasos/ausências) e filtro opcional de turno.
    /// Ver <c>op-historico.html</c> § "Unidades (UPAs)". <paramref name="clinicId"/>
    /// obrigatório — 400 se ausente ou fora do escopo do gestor.
    /// </summary>
    Task<PrefeituraUnitTimelineResponse> GetUnitTimelineAsync(
        Guid clinicId,
        DateTime from,
        DateTime to,
        string? turno = null,
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

    /// <summary>
    /// "Acionar OS": gestor sinaliza uma ausência crítica reusando o
    /// <c>IAlertService.CreateAsync</c>. Não altera o Attendance nem o
    /// Shift — só cria um <c>Alert</c> visível no Admin OS. Valida que o
    /// (shiftId, userId) pertencem a uma clínica no escopo do gestor;
    /// caso contrário retorna <see cref="Application.Exceptions.NotFoundException"/>
    /// (mesmo tratamento do resto do portal — não vaza existência de
    /// recursos fora do organ). Ver design.md § "Acionar OS".
    /// </summary>
    Task<Guid> NotifyOsAboutAbsenceAsync(
        Guid shiftId,
        Guid userId,
        string? message,
        CancellationToken ct = default);
}
