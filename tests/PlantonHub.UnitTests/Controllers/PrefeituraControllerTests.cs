using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PlantonHub.API.Controllers;
using PlantonHub.Application.DTOs.Prefeitura;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.UnitTests.Controllers;

/// <summary>
/// Sprint 7B.1 — cobre <see cref="PrefeituraController"/> na parte que ele
/// é responsável: validação de query params e mapping pra <see cref="IPrefeituraService"/>.
/// Autorização (policy GestorPublico) e rate limit (Session) já são testadas
/// via <c>AuthorizationExtensionsTests</c> e configuração DI — aqui foca na
/// camada Controller pura.
/// </summary>
public class PrefeituraControllerTests
{
    private readonly Mock<IPrefeituraService> _service = new();
    private PrefeituraController CreateController() => new(_service.Object);

    // ─────────────────────────────────────────────────────────────
    // Endpoints sem params — só delegam
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_DelegatesToServiceAndReturnsOk()
    {
        var expected = new PrefeituraDashboardResponse { ClinicCount = 3 };
        _service.Setup(s => s.GetDashboardAsync(It.IsAny<CancellationToken>()))
                .ReturnsAsync(expected);

        var result = await CreateController().GetDashboard(CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().Be(expected);
    }

    [Fact]
    public async Task GetClinics_DelegatesToServiceAndReturnsOk()
    {
        var expected = new List<PrefeituraClinicItem>
        {
            new() { ClinicId = Guid.NewGuid(), Name = "UPA X" },
        };
        _service.Setup(s => s.GetClinicsAsync(It.IsAny<CancellationToken>()))
                .ReturnsAsync(expected);

        var result = await CreateController().GetClinics(CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().Be(expected);
    }

    [Fact]
    public async Task GetRealtime_DelegatesToServiceAndReturnsOk()
    {
        var expected = new PrefeituraRealtimeResponse { TotalClinics = 2 };
        _service.Setup(s => s.GetRealtimeAsync(It.IsAny<CancellationToken>()))
                .ReturnsAsync(expected);

        var result = await CreateController().GetRealtime(CancellationToken.None);

        result.Should().BeOfType<OkObjectResult>()
            .Which.Value.Should().Be(expected);
    }

    // ─────────────────────────────────────────────────────────────
    // Kpis — validação de range + defaults
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetKpis_FromGreaterThanTo_ReturnsBadRequest()
    {
        var future = DateTime.UtcNow.AddDays(5);
        var past = DateTime.UtcNow.AddDays(-5);

        var result = await CreateController().GetKpis(from: future, to: past);

        result.Should().BeOfType<BadRequestObjectResult>();
        _service.Verify(s => s.GetKpisAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetKpis_WithoutRange_UsesDefaultAndDelegates()
    {
        _service.Setup(s => s.GetKpisAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                            It.IsAny<CancellationToken>()))
                .ReturnsAsync(new PrefeituraKpisResponse());

        var result = await CreateController().GetKpis(from: null, to: null);

        result.Should().BeOfType<OkObjectResult>();
        _service.Verify(s => s.GetKpisAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                             It.IsAny<CancellationToken>()), Times.Once);
    }

    // ─────────────────────────────────────────────────────────────
    // Shifts — filtro clinicId propagado
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetShifts_ForwardsClinicIdFilterToService()
    {
        var clinicId = Guid.NewGuid();
        _service.Setup(s => s.GetShiftsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                              clinicId, It.IsAny<CancellationToken>()))
                .ReturnsAsync(Array.Empty<PrefeituraShiftItem>());

        var result = await CreateController().GetShifts(from: null, to: null, clinicId: clinicId);

        result.Should().BeOfType<OkObjectResult>();
        _service.Verify(s => s.GetShiftsAsync(
            It.IsAny<DateTime>(), It.IsAny<DateTime>(), clinicId, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    // ─────────────────────────────────────────────────────────────
    // Frequency
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetFrequency_InvalidRange_ReturnsBadRequest()
    {
        var result = await CreateController().GetFrequency(
            from: DateTime.UtcNow.AddDays(5),
            to: DateTime.UtcNow.AddDays(-5),
            clinicId: null);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    // ─────────────────────────────────────────────────────────────
    // Absences — validação de type + range
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAbsences_InvalidType_ReturnsBadRequest()
    {
        var result = await CreateController().GetAbsences(
            from: null, to: null, type: "invalid-type");

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task GetAbsences_ValidTypeLate_DelegatesWithLowercaseTypeToService()
    {
        _service.Setup(s => s.GetAbsencesAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                                "late", It.IsAny<CancellationToken>()))
                .ReturnsAsync(Array.Empty<PrefeituraAbsenceItem>());

        var result = await CreateController().GetAbsences(from: null, to: null, type: "late");

        result.Should().BeOfType<OkObjectResult>();
        _service.Verify(s => s.GetAbsencesAsync(
            It.IsAny<DateTime>(), It.IsAny<DateTime>(), "late", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task GetAbsences_NullType_IsAccepted()
    {
        _service.Setup(s => s.GetAbsencesAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                                null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(Array.Empty<PrefeituraAbsenceItem>());

        var result = await CreateController().GetAbsences(from: null, to: null, type: null);

        result.Should().BeOfType<OkObjectResult>();
    }

    // ─────────────────────────────────────────────────────────────
    // History — validação de page/pageSize/type
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetHistory_PageBelowOne_ReturnsBadRequest()
    {
        var result = await CreateController().GetHistory(
            from: null, to: null, type: null, search: null, page: 0, pageSize: 30);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task GetHistory_PageSizeAboveLimit_ReturnsBadRequest()
    {
        var result = await CreateController().GetHistory(
            from: null, to: null, type: null, search: null, page: 1, pageSize: 500);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task GetHistory_InvalidType_ReturnsBadRequest()
    {
        var result = await CreateController().GetHistory(
            from: null, to: null, type: "unknown", search: null, page: 1, pageSize: 30);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task GetHistory_ValidParams_DelegatesToServiceAndReturnsOk()
    {
        _service.Setup(s => s.GetHistoryAsync(
                        It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                        "checkin", "ana", 2, 25, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new PrefeituraHistoryPage { Page = 2, PageSize = 25 });

        var result = await CreateController().GetHistory(
            from: null, to: null, type: "checkin", search: "ana", page: 2, pageSize: 25);

        result.Should().BeOfType<OkObjectResult>();
        _service.Verify(s => s.GetHistoryAsync(
            It.IsAny<DateTime>(), It.IsAny<DateTime>(),
            "checkin", "ana", 2, 25, It.IsAny<CancellationToken>()), Times.Once);
    }
}
