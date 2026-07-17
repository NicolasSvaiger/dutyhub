using System.Globalization;
using PlantonHub.Application.DTOs.Audit;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

/// <summary>
/// Regras de leitura da tela Auditoria. Consolida a query paginada com os
/// agregados laterais (KPIs 30d, módulos, top usuários, sparkline 7d).
///
///  • Só AdminGlobal — a auditoria mostra tudo o que aconteceu na OS.
///  • As agregações caem para "últimos 30 dias" para evitar traversal
///    completo em bancos grandes; o dashboard reflete tendência recente.
///  • Cores dos módulos/usuários são determinísticas por hash — permanecem
///    estáveis entre chamadas mesmo sem persistência de paleta.
/// </summary>
public class AuditService : IAuditService
{
    private readonly IAuditLogRepository _repo;
    private readonly ITenantService _tenantService;

    private static readonly string[] MODULE_PALETTE =
    {
        "#6366f1", "#2DBFB8", "#f59e0b", "#22c55e", "#8b5cf6", "#f97316", "#ef4444", "#3b82f6",
    };

    private static readonly string[] USER_PALETTE =
    {
        "#6366f1", "#2DBFB8", "#22c55e", "#8b5cf6", "#f97316", "#ef4444", "#3b82f6", "#f59e0b",
    };

    private static readonly Dictionary<string, string> OPERATION_LABELS = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Create"] = "Criação",
        ["Update"] = "Edição",
        ["Delete"] = "Exclusão",
        ["Login"] = "Login",
        ["Logout"] = "Logout",
        ["Config"] = "Configuração",
        ["Export"] = "Exportação",
        ["System"] = "Sistema",
    };

    public AuditService(IAuditLogRepository repo, ITenantService tenantService)
    {
        _repo = repo;
        _tenantService = tenantService;
    }

    public async Task<IEnumerable<AuditLog>> GetAllAsync()
    {
        var logs = await _repo.GetAllAsync();
        // Garantia de ordem descendente mesmo quando o repositório subjacente
        // (mock em testes, storage sem índice) não devolver ordenado.
        return logs.OrderByDescending(l => l.Timestamp).ToList();
    }

    public async Task LogAsync(string operation, string entity, string entityId, string? details = null)
    {
        await LogAsync(
            _tenantService.GetCurrentUserId() ?? Guid.Empty,
            operation,
            entity,
            entityId,
            details);
    }

    public async Task LogAsync(Guid userId, string operation, string entity, string entityId, string? details = null)
    {
        var log = new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Timestamp = DateTime.UtcNow,
            Operation = operation,
            Entity = entity,
            EntityId = entityId,
            Details = details,
        };
        await _repo.AddAsync(log);
    }

    public async Task<AuditLogPage> GetLogsAsync(
        DateTime? from = null,
        DateTime? to = null,
        Guid? userId = null,
        string? module = null,
        string? operation = null,
        string? search = null,
        int page = 1,
        int pageSize = 30)
    {
        EnsureAdminGlobal();

        var fromUtc = from.HasValue ? DateTime.SpecifyKind(from.Value, DateTimeKind.Utc) : (DateTime?)null;
        var toUtc = to.HasValue ? DateTime.SpecifyKind(to.Value, DateTimeKind.Utc) : (DateTime?)null;

        var filter = new AuditLogFilter(fromUtc, toUtc, userId, module, operation, search, page, pageSize);
        var result = await _repo.GetPagedAsync(filter);

        var items = result.Items.Select(MapEntry).ToList();
        var effectiveSize = Math.Clamp(pageSize, 1, 200);
        return new AuditLogPage
        {
            Items = items,
            TotalCount = result.TotalCount,
            Page = Math.Max(1, page),
            PageSize = effectiveSize,
            TotalPages = (int)Math.Ceiling(result.TotalCount / (double)effectiveSize),
        };
    }

    public async Task<AuditSummaryResponse> GetSummaryAsync()
    {
        EnsureAdminGlobal();

        var now = DateTime.UtcNow;
        var toUtc = now.AddDays(1).Date;
        var fromUtc = toUtc.AddDays(-30);

        var logs = (await _repo.GetInPeriodAsync(fromUtc, toUtc)).ToList();

        var kpis = new AuditKpis
        {
            TotalEvents = logs.Count,
            Creates = logs.Count(l => Match(l.Operation, "Create")),
            Updates = logs.Count(l => Match(l.Operation, "Update")),
            Deletes = logs.Count(l => Match(l.Operation, "Delete")),
            Logins = logs.Count(l => Match(l.Operation, "Login")),
        };

        // Atividade por módulo (top 8)
        var modules = logs
            .Where(l => !string.IsNullOrEmpty(l.Module))
            .GroupBy(l => l.Module!)
            .Select(g => new ModuleActivity
            {
                Module = g.Key,
                Count = g.Count(),
                Color = ColorFor(g.Key, MODULE_PALETTE),
            })
            .OrderByDescending(m => m.Count)
            .Take(8)
            .ToList();

        // Top 5 usuários
        var topUsers = logs
            .GroupBy(l => new { l.UserId, l.User?.Name })
            .Select(g =>
            {
                var name = g.Key.Name ?? "Sistema";
                return new TopUserActivity
                {
                    UserId = g.Key.UserId,
                    UserName = name,
                    Initials = Initials(name),
                    Role = g.FirstOrDefault()?.User?.ProfessionalType?.ToString(),
                    Count = g.Count(),
                    Color = ColorFor(g.Key.UserId.ToString(), USER_PALETTE),
                };
            })
            .OrderByDescending(u => u.Count)
            .Take(5)
            .ToList();

        // Últimos 7 dias (ordem crescente por data)
        var days = new List<DailyCount>();
        var today = now.Date;
        var brCulture = new CultureInfo("pt-BR");
        for (int i = 6; i >= 0; i--)
        {
            var d = today.AddDays(-i);
            var count = logs.Count(l => l.Timestamp.Date == d);
            var dayName = d.ToString("ddd", brCulture);
            days.Add(new DailyCount
            {
                Date = d,
                DayLabel = dayName.Length > 0 ? dayName[0].ToString().ToUpperInvariant() : "-",
                Count = count,
            });
        }

        return new AuditSummaryResponse
        {
            Kpis = kpis,
            Modules = modules,
            TopUsers = topUsers,
            Last7Days = days,
        };
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private void EnsureAdminGlobal()
    {
        if (!_tenantService.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can view the audit trail.");
    }

    private static bool Match(string op, string expected) =>
        string.Equals(op, expected, StringComparison.OrdinalIgnoreCase);

    private static AuditLogEntry MapEntry(AuditLog log)
    {
        var brCulture = new CultureInfo("pt-BR");
        var userName = log.User?.Name ?? "Sistema";
        return new AuditLogEntry
        {
            Id = log.Id,
            Timestamp = log.Timestamp,
            DateLabel = log.Timestamp.ToString("dd/MM/yyyy", brCulture),
            TimeLabel = log.Timestamp.ToString("HH:mm:ss", brCulture),
            UserId = log.UserId,
            UserName = userName,
            UserInitials = Initials(userName),
            UserRole = log.User?.ProfessionalType?.ToString(),
            Operation = log.Operation,
            OperationLabel = OPERATION_LABELS.TryGetValue(log.Operation, out var lbl) ? lbl : log.Operation,
            Module = log.Module,
            Entity = log.Entity,
            EntityId = log.EntityId,
            Action = BuildActionLabel(log),
            Details = log.Details,
            IpAddress = log.IpAddress,
            BeforeValue = log.BeforeValue,
            AfterValue = log.AfterValue,
        };
    }

    /// <summary>
    /// Título curto do evento na timeline. Se o próprio detalhe já traz um título
    /// curto, usa a primeira linha; caso contrário monta a partir de operation+entity.
    /// </summary>
    private static string BuildActionLabel(AuditLog log)
    {
        if (!string.IsNullOrWhiteSpace(log.Details))
        {
            var firstLine = log.Details.Split('\n', 2)[0].Trim();
            if (firstLine.Length is > 0 and <= 90) return firstLine;
        }
        var lbl = OPERATION_LABELS.TryGetValue(log.Operation, out var l) ? l : log.Operation;
        var target = string.IsNullOrEmpty(log.Entity) ? log.Module : log.Entity;
        return string.IsNullOrEmpty(target) ? lbl : $"{lbl} — {target}";
    }

    private static string Initials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "—";
        if (parts.Length == 1) return parts[0][..Math.Min(2, parts[0].Length)].ToUpperInvariant();
        return (parts[0][0].ToString() + parts[^1][0].ToString()).ToUpperInvariant();
    }

    private static string ColorFor(string key, string[] palette)
    {
        var hash = 0;
        foreach (var c in key) hash = unchecked(hash * 31 + c);
        return palette[Math.Abs(hash) % palette.Length];
    }
}
