using FluentAssertions;
using Moq;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Cobre as duas rotas usadas pela home/plantões do médico:
///   • GetMyTodayShiftsAsync — modal de check-in
///   • GetMyShiftsAsync      — tela "Plantões" (list completa)
///
/// Foca nas regras de filtragem (usuário/clínica/data) e ordenação.
/// </summary>
public class ShiftServiceTests
{
    private readonly Mock<IShiftRepository> _shiftRepo = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<ICacheService> _cache = new();

    private ShiftService CreateService()
        => new(_shiftRepo.Object, _userRepo.Object, _tenant.Object, _cache.Object);

    private static Shift MakeShift(Guid clinicId, DateTime date, TimeSpan? start = null)
        => new()
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            Title = $"Plantão {date:dd/MM}",
            Date = date,
            StartTime = start ?? new TimeSpan(8, 0, 0),
            EndTime = new TimeSpan(18, 0, 0),
            CreatedAt = date,
        };

    // ─────────────────────────────────────────────────────────────
    // GetMyTodayShiftsAsync
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyTodayShiftsAsync_NoUserId_ReturnsEmpty()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);
        _tenant.Setup(t => t.GetCurrentClinicId()).Returns(Guid.NewGuid());

        var result = await CreateService().GetMyTodayShiftsAsync();

        result.Should().BeEmpty();
        _shiftRepo.Verify(r => r.GetByUserIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task GetMyTodayShiftsAsync_NoClinicId_ReturnsEmpty()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(Guid.NewGuid());
        _tenant.Setup(t => t.GetCurrentClinicId()).Returns((Guid?)null);

        var result = await CreateService().GetMyTodayShiftsAsync();

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetMyTodayShiftsAsync_FiltersOutOtherClinicShifts()
    {
        var userId = Guid.NewGuid();
        var alpha = Guid.NewGuid();
        var beta = Guid.NewGuid();
        var today = DateTime.UtcNow.Date;

        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetCurrentClinicId()).Returns(alpha);

        _shiftRepo.Setup(r => r.GetByUserIdAsync(userId))
            .ReturnsAsync(new[]
            {
                MakeShift(alpha, today), // in
                MakeShift(beta, today),  // out — clínica errada
            });

        var result = (await CreateService().GetMyTodayShiftsAsync()).ToList();

        result.Should().ContainSingle();
        result[0].ClinicId.Should().Be(alpha);
    }

    [Fact]
    public async Task GetMyTodayShiftsAsync_FiltersOutNonTodayShifts()
    {
        var userId = Guid.NewGuid();
        var clinic = Guid.NewGuid();
        var today = DateTime.UtcNow.Date;

        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetCurrentClinicId()).Returns(clinic);

        _shiftRepo.Setup(r => r.GetByUserIdAsync(userId))
            .ReturnsAsync(new[]
            {
                MakeShift(clinic, today.AddDays(-1)), // ontem
                MakeShift(clinic, today),             // hoje ← único que fica
                MakeShift(clinic, today.AddDays(1)),  // amanhã
            });

        var result = (await CreateService().GetMyTodayShiftsAsync()).ToList();

        result.Should().ContainSingle();
        result[0].Date.Date.Should().Be(today);
    }

    [Fact]
    public async Task GetMyTodayShiftsAsync_OrdersByStartTime()
    {
        var userId = Guid.NewGuid();
        var clinic = Guid.NewGuid();
        var today = DateTime.UtcNow.Date;

        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetCurrentClinicId()).Returns(clinic);

        _shiftRepo.Setup(r => r.GetByUserIdAsync(userId))
            .ReturnsAsync(new[]
            {
                MakeShift(clinic, today, new TimeSpan(19, 0, 0)),
                MakeShift(clinic, today, new TimeSpan(8, 0, 0)),
                MakeShift(clinic, today, new TimeSpan(13, 0, 0)),
            });

        var result = (await CreateService().GetMyTodayShiftsAsync()).ToList();

        result.Select(s => s.StartTime).Should().BeInAscendingOrder();
    }

    // ─────────────────────────────────────────────────────────────
    // GetMyShiftsAsync
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyShiftsAsync_NoUserId_ReturnsEmpty()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);

        var result = await CreateService().GetMyShiftsAsync();

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetMyShiftsAsync_ReturnsShiftsFromAllAuthorizedClinics()
    {
        var userId = Guid.NewGuid();
        var alpha = Guid.NewGuid();
        var beta = Guid.NewGuid();
        var other = Guid.NewGuid();

        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { alpha, beta });

        _shiftRepo.Setup(r => r.GetByUserIdAsync(userId))
            .ReturnsAsync(new[]
            {
                MakeShift(alpha, DateTime.UtcNow.Date),
                MakeShift(beta, DateTime.UtcNow.Date),
                MakeShift(other, DateTime.UtcNow.Date), // clínica NÃO autorizada → filtra fora
            });

        var result = (await CreateService().GetMyShiftsAsync()).ToList();

        result.Should().HaveCount(2);
        result.Select(s => s.ClinicId).Should().OnlyContain(id => id == alpha || id == beta);
        result.Select(s => s.ClinicId).Should().NotContain(other);
    }

    [Fact]
    public async Task GetMyShiftsAsync_EmptyAuthorizedList_ReturnsAllShiftsUnfiltered()
    {
        // Comportamento defensivo: se por algum motivo a lista de autorizadas
        // está vazia (ex: token sem claim), retorna o que vier — melhor exibir
        // do que sumir com tudo silenciosamente.
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Array.Empty<Guid>());

        _shiftRepo.Setup(r => r.GetByUserIdAsync(userId))
            .ReturnsAsync(new[] { MakeShift(Guid.NewGuid(), DateTime.UtcNow.Date) });

        var result = await CreateService().GetMyShiftsAsync();

        result.Should().ContainSingle();
    }

    [Fact]
    public async Task GetMyShiftsAsync_OrdersByDateDescendingThenStartTimeAscending()
    {
        var userId = Guid.NewGuid();
        var clinic = Guid.NewGuid();
        var today = DateTime.UtcNow.Date;

        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinic });

        _shiftRepo.Setup(r => r.GetByUserIdAsync(userId))
            .ReturnsAsync(new[]
            {
                MakeShift(clinic, today.AddDays(-2)),
                MakeShift(clinic, today, new TimeSpan(19, 0, 0)),
                MakeShift(clinic, today, new TimeSpan(8, 0, 0)),
                MakeShift(clinic, today.AddDays(-1)),
            });

        var result = (await CreateService().GetMyShiftsAsync()).ToList();

        // 1º os de hoje (por startTime asc: 8h antes de 19h), depois ontem, depois antes de ontem
        result[0].Date.Date.Should().Be(today);
        result[0].StartTime.Should().Be(new TimeSpan(8, 0, 0));
        result[1].Date.Date.Should().Be(today);
        result[1].StartTime.Should().Be(new TimeSpan(19, 0, 0));
        result[2].Date.Date.Should().Be(today.AddDays(-1));
        result[3].Date.Date.Should().Be(today.AddDays(-2));
    }
}
