using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Alerts;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

public class AlertServiceTests
{
    private readonly Mock<IAlertRepository> _repo = new();
    private readonly Mock<ITenantService> _tenant = new();

    private AlertService CreateService() => new(_repo.Object, _tenant.Object);

    private static readonly Guid AlphaClinicId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid BetaClinicId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid AdminId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private static Alert MakeAlert(AlertLevel level, bool isResolved = false, Guid? clinicId = null, DateTime? createdAt = null, string code = "ALT-2026-9999") => new()
    {
        Id = Guid.NewGuid(),
        Code = code,
        Level = level,
        Type = AlertType.UncoveredShift,
        Title = "Test",
        Description = "Test desc",
        ClinicId = clinicId,
        IsResolved = isResolved,
        ResolvedAt = isResolved ? DateTime.UtcNow : null,
        CreatedAt = createdAt ?? DateTime.UtcNow,
    };

    // ── GetAllAsync tenant scoping ────────────────────────────────────────────

    [Fact]
    public async Task GetAllAsync_AdminGlobal_ReturnsAll()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[]
        {
            MakeAlert(AlertLevel.Critical, clinicId: AlphaClinicId, code: "A1"),
            MakeAlert(AlertLevel.Warning, clinicId: BetaClinicId, code: "A2"),
            MakeAlert(AlertLevel.Info, clinicId: null, code: "A3"),
        });

        var result = (await CreateService().GetAllAsync()).ToList();

        result.Should().HaveCount(3);
        _repo.Verify(r => r.GetAllAsync(), Times.Once);
        _repo.Verify(r => r.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), It.IsAny<bool>()), Times.Never);
    }

    [Fact]
    public async Task GetAllAsync_AdminClinicaWithoutAuthorized_ReturnsEmpty()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Enumerable.Empty<Guid>());

        var result = (await CreateService().GetAllAsync()).ToList();

        result.Should().BeEmpty();
        _repo.Verify(r => r.GetAllAsync(), Times.Never);
    }

    [Fact]
    public async Task GetAllAsync_AdminClinica_UsesGetByClinicIdsWithIncludeGlobal()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { AlphaClinicId });
        _repo.Setup(r => r.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), true))
            .ReturnsAsync(new[] { MakeAlert(AlertLevel.Critical, clinicId: AlphaClinicId) });

        var result = (await CreateService().GetAllAsync()).ToList();

        result.Should().HaveCount(1);
        _repo.Verify(r => r.GetByClinicIdsAsync(It.Is<IEnumerable<Guid>>(ids => ids.Contains(AlphaClinicId)), true), Times.Once);
    }

    // ── GetByIdAsync tenant scoping ───────────────────────────────────────────

    [Fact]
    public async Task GetByIdAsync_AdminClinicaCannotSeeOtherClinicAlert()
    {
        var alert = MakeAlert(AlertLevel.Critical, clinicId: BetaClinicId);
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { AlphaClinicId });
        _repo.Setup(r => r.GetByIdAsync(alert.Id)).ReturnsAsync(alert);

        var result = await CreateService().GetByIdAsync(alert.Id);

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetByIdAsync_AdminClinicaCanSeeGlobalAlert()
    {
        var alert = MakeAlert(AlertLevel.Info, clinicId: null);
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { AlphaClinicId });
        _repo.Setup(r => r.GetByIdAsync(alert.Id)).ReturnsAsync(alert);

        var result = await CreateService().GetByIdAsync(alert.Id);

        result.Should().NotBeNull();
    }

    // ── GetSummaryAsync KPIs ──────────────────────────────────────────────────

    [Fact]
    public async Task GetSummaryAsync_CountsByLevelAndResolvedStatus()
    {
        var today = DateTime.UtcNow.Date;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[]
        {
            MakeAlert(AlertLevel.Critical, code: "C1", createdAt: today.AddHours(1)),
            MakeAlert(AlertLevel.Critical, code: "C2", createdAt: today.AddHours(2)),
            MakeAlert(AlertLevel.Warning, code: "W1", createdAt: today.AddHours(3)),
            MakeAlert(AlertLevel.Info, code: "I1", createdAt: today.AddHours(4)),
            new Alert
            {
                Id = Guid.NewGuid(), Code = "R1", Level = AlertLevel.Resolved,
                Type = AlertType.UncoveredShift, Title = "T", Description = "D",
                IsResolved = true, ResolvedAt = today.AddHours(5),
                CreatedAt = today.AddDays(-1),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "R2", Level = AlertLevel.Resolved,
                Type = AlertType.Delay, Title = "T", Description = "D",
                IsResolved = true, ResolvedAt = today.AddDays(-1).AddHours(1),
                CreatedAt = today.AddDays(-2),
            },
        });

        var summary = await CreateService().GetSummaryAsync();

        summary.TotalAll.Should().Be(6);
        summary.OpenCritical.Should().Be(2);
        summary.OpenWarning.Should().Be(1);
        summary.OpenInfo.Should().Be(1);
        summary.ResolvedToday.Should().Be(1); // só R1 (R2 é de ontem)
        summary.TotalToday.Should().Be(4); // critical x2 + warning + info criados hoje
    }

    // ── CreateAsync ───────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateAsync_GeneratesCodeIfEmpty()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _repo.Setup(r => r.CodeExistsAsync(It.IsAny<string>())).ReturnsAsync(false);

        Alert? captured = null;
        _repo.Setup(r => r.AddAsync(It.IsAny<Alert>()))
            .Callback<Alert>(a => captured = a)
            .Returns(Task.CompletedTask);
        _repo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync(() => captured);

        var result = await CreateService().CreateAsync(new CreateAlertRequest
        {
            Level = AlertLevel.Warning,
            Type = AlertType.Delay,
            Title = "New alert",
            Description = "Desc",
        });

        captured.Should().NotBeNull();
        captured!.Code.Should().StartWith($"ALT-{DateTime.UtcNow.Year}-");
        result.Title.Should().Be("New alert");
    }

    [Fact]
    public async Task CreateAsync_ExistingCode_Throws()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _repo.Setup(r => r.CodeExistsAsync("DUP-1")).ReturnsAsync(true);

        var act = () => CreateService().CreateAsync(new CreateAlertRequest
        {
            Code = "DUP-1",
            Title = "T", Description = "D",
        });

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task CreateAsync_ProfessionalUser_Forbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "Medico" });

        var act = () => CreateService().CreateAsync(new CreateAlertRequest
        {
            Title = "T", Description = "D",
        });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task CreateAsync_AdminClinicaOnOtherClinic_Forbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { AlphaClinicId });

        var act = () => CreateService().CreateAsync(new CreateAlertRequest
        {
            Title = "T", Description = "D",
            ClinicId = BetaClinicId, // não autorizado
        });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ── ResolveAsync ──────────────────────────────────────────────────────────

    [Fact]
    public async Task ResolveAsync_MarksIsResolvedAndSetsLevel()
    {
        var alert = MakeAlert(AlertLevel.Critical, clinicId: AlphaClinicId);
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(AdminId);
        _repo.Setup(r => r.GetByIdAsync(alert.Id)).ReturnsAsync(alert);
        _repo.Setup(r => r.UpdateAsync(It.IsAny<Alert>())).Returns(Task.CompletedTask);

        var result = await CreateService().ResolveAsync(alert.Id, new ResolveAlertRequest { ResolutionNotes = "Ok" });

        alert.IsResolved.Should().BeTrue();
        alert.Level.Should().Be(AlertLevel.Resolved);
        alert.ResolvedByUserId.Should().Be(AdminId);
        alert.ResolutionNotes.Should().Be("Ok");
        result.IsResolved.Should().BeTrue();
    }

    [Fact]
    public async Task ResolveAsync_AlreadyResolved_ReturnsWithoutMutation()
    {
        var alert = MakeAlert(AlertLevel.Resolved, isResolved: true, clinicId: AlphaClinicId);
        var originalResolvedAt = alert.ResolvedAt;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _repo.Setup(r => r.GetByIdAsync(alert.Id)).ReturnsAsync(alert);

        var result = await CreateService().ResolveAsync(alert.Id);

        alert.ResolvedAt.Should().Be(originalResolvedAt);
        result.IsResolved.Should().BeTrue();
        _repo.Verify(r => r.UpdateAsync(It.IsAny<Alert>()), Times.Never);
    }

    [Fact]
    public async Task ResolveAsync_NotFound_Throws()
    {
        _repo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Alert?)null);
        var act = () => CreateService().ResolveAsync(Guid.NewGuid());
        await act.Should().ThrowAsync<NotFoundException>();
    }

    // ── ResolveAllAsync ───────────────────────────────────────────────────────

    [Fact]
    public async Task ResolveAllAsync_AdminGlobal_PassesGlobalScope()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(AdminId);
        _repo.Setup(r => r.ResolveAllAsync(null, AdminId, It.IsAny<DateTime>(), true))
            .ReturnsAsync(7);

        var count = await CreateService().ResolveAllAsync();

        count.Should().Be(7);
        _repo.Verify(r => r.ResolveAllAsync(null, AdminId, It.IsAny<DateTime>(), true), Times.Once);
    }

    [Fact]
    public async Task ResolveAllAsync_AdminClinica_PassesAuthorizedClinics()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(AdminId);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { AlphaClinicId });
        _repo.Setup(r => r.ResolveAllAsync(It.IsAny<IEnumerable<Guid>>(), AdminId, It.IsAny<DateTime>(), false))
            .ReturnsAsync(3);

        var count = await CreateService().ResolveAllAsync();

        count.Should().Be(3);
        _repo.Verify(r => r.ResolveAllAsync(
            It.Is<IEnumerable<Guid>>(ids => ids.Contains(AlphaClinicId)),
            AdminId, It.IsAny<DateTime>(), false), Times.Once);
    }

    [Fact]
    public async Task ResolveAllAsync_ProfessionalUser_Forbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "Medico" });

        var act = () => CreateService().ResolveAllAsync();

        await act.Should().ThrowAsync<ForbiddenException>();
    }
}
