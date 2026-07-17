using FluentAssertions;
using Moq;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Cobre AuditService — tela Admin OS → Auditoria.
///  • Autorização: apenas AdminGlobal
///  • getLogsAsync: paginação, filtros combinados
///  • getSummaryAsync: KPIs 30d, top módulos, top usuários, série 7d
///  • Mapeamento (rótulos localizados de Operation, initials, etc)
/// </summary>
public class AuditServiceTests
{
    private readonly Mock<IAuditLogRepository> _repo = new();
    private readonly Mock<ITenantService> _tenant = new();

    private AuditService CreateService() => new(_repo.Object, _tenant.Object);

    private static User MakeUser(Guid id, string name) => new()
    {
        Id = id, Name = name, Email = $"{id}@x", PasswordHash = "h",
        IsActive = true, ProfessionalType = ProfessionalType.Medico,
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
    };

    private static AuditLog MakeLog(
        Guid userId, string userName, string operation, string entity,
        DateTime? timestamp = null, string? module = null,
        string? details = null, string? ip = null,
        string? before = null, string? after = null) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        User = MakeUser(userId, userName),
        Timestamp = timestamp ?? DateTime.UtcNow,
        Operation = operation,
        Entity = entity,
        EntityId = Guid.NewGuid().ToString(),
        Details = details,
        Module = module,
        IpAddress = ip,
        BeforeValue = before,
        AfterValue = after,
    };

    // ── Autorização ─────────────────────────────────────────────────────

    [Fact]
    public async Task GetLogs_NonAdminGlobal_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        var act = () => CreateService().GetLogsAsync();
        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task GetSummary_NonAdminGlobal_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        var act = () => CreateService().GetSummaryAsync();
        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ── GetLogsAsync ───────────────────────────────────────────────────

    [Fact]
    public async Task GetLogs_ReturnsPageWithFormattedFields()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var uid = Guid.NewGuid();
        var ts = new DateTime(2026, 5, 11, 11, 23, 14, DateTimeKind.Utc);
        var log = MakeLog(uid, "Sileide Rocha", "Update", "SystemSettings", ts,
            module: "Configurações", details: "Tolerância global alterada de 10 min para 15 min",
            ip: "189.14.55.22", before: "10 min", after: "15 min");

        _repo.Setup(r => r.GetPagedAsync(It.IsAny<AuditLogFilter>()))
            .ReturnsAsync(new AuditLogPageResult(new List<AuditLog> { log }, 1));

        var result = await CreateService().GetLogsAsync(pageSize: 20);

        result.Items.Should().HaveCount(1);
        var entry = result.Items[0];
        entry.UserName.Should().Be("Sileide Rocha");
        entry.UserInitials.Should().Be("SR");
        entry.Operation.Should().Be("Update");
        entry.OperationLabel.Should().Be("Edição");
        entry.Module.Should().Be("Configurações");
        entry.DateLabel.Should().Be("11/05/2026");
        entry.TimeLabel.Should().Be("11:23:14");
        entry.BeforeValue.Should().Be("10 min");
        entry.AfterValue.Should().Be("15 min");
        entry.Action.Should().Be("Tolerância global alterada de 10 min para 15 min");

        result.Page.Should().Be(1);
        result.PageSize.Should().Be(20);
        result.TotalCount.Should().Be(1);
        result.TotalPages.Should().Be(1);
    }

    [Fact]
    public async Task GetLogs_ForwardsAllFiltersToRepository()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        AuditLogFilter? captured = null;
        _repo.Setup(r => r.GetPagedAsync(It.IsAny<AuditLogFilter>()))
            .Callback<AuditLogFilter>(f => captured = f)
            .ReturnsAsync(new AuditLogPageResult(new List<AuditLog>(), 0));

        var uid = Guid.NewGuid();
        var from = new DateTime(2026, 5, 1);
        var to = new DateTime(2026, 5, 11);

        await CreateService().GetLogsAsync(
            from: from, to: to,
            userId: uid,
            module: "Escalas",
            operation: "Update",
            search: "check-in",
            page: 3, pageSize: 25);

        captured.Should().NotBeNull();
        captured!.UserId.Should().Be(uid);
        captured.Module.Should().Be("Escalas");
        captured.Operation.Should().Be("Update");
        captured.Search.Should().Be("check-in");
        captured.Page.Should().Be(3);
        captured.PageSize.Should().Be(25);
        captured.FromUtc.Should().Be(from);
        captured.ToUtc.Should().Be(to);
    }

    [Fact]
    public async Task GetLogs_ClampsPageSizeAndComputesTotalPages()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetPagedAsync(It.IsAny<AuditLogFilter>()))
            .ReturnsAsync(new AuditLogPageResult(new List<AuditLog>(), 250));

        var result = await CreateService().GetLogsAsync(pageSize: 500); // acima do máx

        result.PageSize.Should().Be(200);
        result.TotalPages.Should().Be(2); // ceil(250/200)
        result.Page.Should().Be(1);
    }

    // ── GetSummaryAsync ────────────────────────────────────────────────

    [Fact]
    public async Task GetSummary_ComputesKpisByOperationType()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var uid = Guid.NewGuid();
        _repo.Setup(r => r.GetInPeriodAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<AuditLog>
            {
                MakeLog(uid, "Sileide", "Create", "Shift"),
                MakeLog(uid, "Sileide", "Create", "User"),
                MakeLog(uid, "Sileide", "Update", "Contract"),
                MakeLog(uid, "Sileide", "Update", "Contract"),
                MakeLog(uid, "Sileide", "Update", "Contract"),
                MakeLog(uid, "Sileide", "Delete", "User"),
                MakeLog(uid, "Sileide", "Login",  "User"),
                MakeLog(uid, "Sileide", "System", "Notification"),
            });

        var result = await CreateService().GetSummaryAsync();

        result.Kpis.TotalEvents.Should().Be(8);
        result.Kpis.Creates.Should().Be(2);
        result.Kpis.Updates.Should().Be(3);
        result.Kpis.Deletes.Should().Be(1);
        result.Kpis.Logins.Should().Be(1);
    }

    [Fact]
    public async Task GetSummary_TopUsersOrderedDescending()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var u1 = Guid.NewGuid();
        var u2 = Guid.NewGuid();
        var u3 = Guid.NewGuid();

        _repo.Setup(r => r.GetInPeriodAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<AuditLog>
            {
                MakeLog(u1, "Sileide Rocha", "Login", "User"),
                MakeLog(u1, "Sileide Rocha", "Update", "Config"),
                MakeLog(u1, "Sileide Rocha", "Create", "Shift"),
                MakeLog(u2, "Carlos Mendes", "Update", "Config"),
                MakeLog(u2, "Carlos Mendes", "Update", "Config"),
                MakeLog(u3, "Fernanda Castro", "Update", "Config"),
            });

        var result = await CreateService().GetSummaryAsync();

        result.TopUsers.Should().HaveCount(3);
        result.TopUsers[0].UserId.Should().Be(u1);
        result.TopUsers[0].Count.Should().Be(3);
        result.TopUsers[0].Initials.Should().Be("SR");
        result.TopUsers[1].UserId.Should().Be(u2);
        result.TopUsers[1].Count.Should().Be(2);
        result.TopUsers[2].UserId.Should().Be(u3);
    }

    [Fact]
    public async Task GetSummary_ModuleActivity_OrderedAndSkipsNulls()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var uid = Guid.NewGuid();

        _repo.Setup(r => r.GetInPeriodAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<AuditLog>
            {
                MakeLog(uid, "A", "Update", "X", module: "Escalas"),
                MakeLog(uid, "A", "Update", "X", module: "Escalas"),
                MakeLog(uid, "A", "Update", "X", module: "Médicos"),
                MakeLog(uid, "A", "Update", "X", module: null), // sem módulo — ignorado
            });

        var result = await CreateService().GetSummaryAsync();

        result.Modules.Should().HaveCount(2);
        result.Modules[0].Module.Should().Be("Escalas");
        result.Modules[0].Count.Should().Be(2);
        result.Modules[1].Module.Should().Be("Médicos");
        result.Modules[1].Count.Should().Be(1);
    }

    [Fact]
    public async Task GetSummary_Last7Days_Has7EntriesInAscendingOrder()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var uid = Guid.NewGuid();
        var today = DateTime.UtcNow.Date;

        _repo.Setup(r => r.GetInPeriodAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<AuditLog>
            {
                MakeLog(uid, "A", "Login", "User", timestamp: today),
                MakeLog(uid, "A", "Login", "User", timestamp: today),
                MakeLog(uid, "A", "Login", "User", timestamp: today.AddDays(-3)),
            });

        var result = await CreateService().GetSummaryAsync();

        result.Last7Days.Should().HaveCount(7);
        result.Last7Days.First().Date.Should().Be(today.AddDays(-6));
        result.Last7Days.Last().Date.Should().Be(today);
        result.Last7Days.Last().Count.Should().Be(2); // dois eventos hoje
        result.Last7Days[3].Count.Should().Be(1); // -3 dias
    }

    [Fact]
    public async Task GetSummary_UserWithNullNameFallsBackToSystema()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var uid = Guid.NewGuid();
        var log = new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = uid,
            User = null!, // simula log sem User carregado
            Timestamp = DateTime.UtcNow,
            Operation = "System",
            Entity = "Notification",
            EntityId = "n1",
        };

        _repo.Setup(r => r.GetInPeriodAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<AuditLog> { log });

        var result = await CreateService().GetSummaryAsync();

        result.TopUsers.Should().ContainSingle();
        result.TopUsers[0].UserName.Should().Be("Sistema");
    }

    [Fact]
    public async Task GetLogs_ActionFallsBackWhenDetailsIsNull()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var uid = Guid.NewGuid();
        var log = MakeLog(uid, "A", "Delete", "User", module: "Usuários", details: null);
        _repo.Setup(r => r.GetPagedAsync(It.IsAny<AuditLogFilter>()))
            .ReturnsAsync(new AuditLogPageResult(new List<AuditLog> { log }, 1));

        var result = await CreateService().GetLogsAsync();

        result.Items[0].Action.Should().Be("Exclusão — User");
    }

    [Fact]
    public async Task GetLogs_ActionUsesShortDetailsAsTitle()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var uid = Guid.NewGuid();
        var log = MakeLog(uid, "A", "Create", "User", details: "Médico cadastrado");
        _repo.Setup(r => r.GetPagedAsync(It.IsAny<AuditLogFilter>()))
            .ReturnsAsync(new AuditLogPageResult(new List<AuditLog> { log }, 1));

        var result = await CreateService().GetLogsAsync();

        result.Items[0].Action.Should().Be("Médico cadastrado");
    }
}
