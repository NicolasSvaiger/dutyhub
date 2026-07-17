using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

/// <summary>
/// Filtros aceitos pela consulta paginada da tela Auditoria.
/// </summary>
public record AuditLogFilter(
    DateTime? FromUtc = null,
    DateTime? ToUtc = null,
    Guid? UserId = null,
    string? Module = null,
    string? Operation = null,
    string? Search = null,
    int Page = 1,
    int PageSize = 30);

public record AuditLogPageResult(IReadOnlyList<AuditLog> Items, int TotalCount);

public interface IAuditLogRepository
{
    Task<IEnumerable<AuditLog>> GetAllAsync();
    Task AddAsync(AuditLog auditLog);

    /// <summary>Página filtrada + total (ordem DESC por Timestamp).</summary>
    Task<AuditLogPageResult> GetPagedAsync(AuditLogFilter filter);

    /// <summary>Todos os logs em um intervalo. Base para KPIs e agregações.</summary>
    Task<IEnumerable<AuditLog>> GetInPeriodAsync(DateTime fromUtc, DateTime toUtc);
}
