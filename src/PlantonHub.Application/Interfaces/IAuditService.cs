using PlantonHub.Application.DTOs.Audit;
using PlantonHub.Domain.Entities;

namespace PlantonHub.Application.Interfaces;

public interface IAuditService
{
    /// <summary>
    /// Página filtrada da timeline. Só AdminGlobal — a auditoria é visão da OS.
    /// </summary>
    Task<AuditLogPage> GetLogsAsync(
        DateTime? from = null,
        DateTime? to = null,
        Guid? userId = null,
        string? module = null,
        string? operation = null,
        string? search = null,
        int page = 1,
        int pageSize = 30);

    /// <summary>KPIs + agregações laterais (últimos 30 dias).</summary>
    Task<AuditSummaryResponse> GetSummaryAsync();

    /// <summary>
    /// Retorna todos os logs em ordem cronológica reversa. Consumido por
    /// integrações e testes; a tela usa <see cref="GetLogsAsync"/> paginado.
    /// </summary>
    Task<IEnumerable<AuditLog>> GetAllAsync();

    /// <summary>
    /// Grava uma entrada de auditoria vinculada ao usuário corrente
    /// (obtido via ITenantService). Chamado pelos demais services quando
    /// há mutações relevantes de negócio.
    /// </summary>
    Task LogAsync(string operation, string entity, string entityId, string? details = null);

    /// <summary>
    /// Grava uma entrada de auditoria com o usuário explícito, ignorando o
    /// TenantService. Usado nos eventos de login (o usuário ainda não está
    /// autenticado no HttpContext no momento da gravação) e em jobs que
    /// não têm um caller humano.
    /// </summary>
    Task LogAsync(Guid userId, string operation, string entity, string entityId, string? details = null);
}
