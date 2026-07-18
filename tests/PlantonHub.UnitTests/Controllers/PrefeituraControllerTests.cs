using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PlantonHub.API.Controllers;
using PlantonHub.Application.DTOs.Prefeitura;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Reports;

namespace PlantonHub.UnitTests.Controllers;

/// <summary>
/// Sprint 7B.1 + 7B.2 — cobre <see cref="PrefeituraController"/> na parte
/// que ele é responsável: validação de query params e mapping pra
/// <see cref="IPrefeituraService"/> / <see cref="IReportService"/>.
/// Autorização (policy GestorPublico) e rate limit já são testadas via
/// <c>AuthorizationExtensionsTests</c> e configuração DI — aqui foca na
/// camada Controller pura.
/// </summary>
public class PrefeituraControllerTests
{
    private readonly Mock<IPrefeituraService> _service = new();
    private readonly Mock<IReportService> _reportService = new();
    private PrefeituraController CreateController() => new(_service.Object, _reportService.Object);

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

    // ─────────────────────────────────────────────────────────────
    // Sprint 7B.2 — NotifyOs endpoint
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task NotifyOs_ValidRequest_ReturnsCreatedWithAlertId()
    {
        var expected = Guid.NewGuid();
        _service.Setup(s => s.NotifyOsAboutAbsenceAsync(
                        It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(expected);

        var result = await CreateController().NotifyOs(new NotifyOsRequest
        {
            ShiftId = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
            Message = "manda ver",
        }, CancellationToken.None);

        result.Should().BeOfType<CreatedResult>();
    }

    [Fact]
    public async Task NotifyOs_EmptyShiftId_ReturnsBadRequest()
    {
        var result = await CreateController().NotifyOs(new NotifyOsRequest
        {
            ShiftId = Guid.Empty,
            UserId = Guid.NewGuid(),
        }, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
        _service.Verify(s => s.NotifyOsAboutAbsenceAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task NotifyOs_EmptyUserId_ReturnsBadRequest()
    {
        var result = await CreateController().NotifyOs(new NotifyOsRequest
        {
            ShiftId = Guid.NewGuid(),
            UserId = Guid.Empty,
        }, CancellationToken.None);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task NotifyOs_NullBody_ReturnsBadRequest()
    {
        var result = await CreateController().NotifyOs(null!, CancellationToken.None);
        result.Should().BeOfType<BadRequestObjectResult>();
    }

    // ─────────────────────────────────────────────────────────────
    // Sprint 7B.2 — ExportReport endpoint
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task ExportReport_ValidParams_ReturnsFile()
    {
        var pdfBytes = new byte[] { 1, 2, 3 };
        _reportService.Setup(r => r.GenerateAsync(It.IsAny<ReportRequest>(), It.IsAny<CancellationToken>()))
                      .ReturnsAsync(new GeneratedReport(pdfBytes, "application/pdf", "kpis-2026-07-17.pdf"));

        var result = await CreateController().ExportReport(
            reportType: "kpis", format: "pdf",
            from: null, to: null, clinicId: null, filter: null, search: null);

        var file = result.Should().BeOfType<FileContentResult>().Subject;
        file.FileContents.Should().Equal(pdfBytes);
        file.ContentType.Should().Be("application/pdf");
        file.FileDownloadName.Should().Be("kpis-2026-07-17.pdf");
    }

    [Fact]
    public async Task ExportReport_InvalidReportType_ReturnsBadRequest()
    {
        var result = await CreateController().ExportReport(
            reportType: "not-a-type", format: "pdf",
            from: null, to: null, clinicId: null, filter: null, search: null);

        result.Should().BeOfType<BadRequestObjectResult>();
        _reportService.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ExportReport_InvalidFormat_ReturnsBadRequest()
    {
        var result = await CreateController().ExportReport(
            reportType: "kpis", format: "docx",
            from: null, to: null, clinicId: null, filter: null, search: null);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task ExportReport_FromGreaterThanTo_ReturnsBadRequest()
    {
        var future = DateTime.UtcNow.AddDays(5);
        var past = DateTime.UtcNow.AddDays(-5);

        var result = await CreateController().ExportReport(
            reportType: "kpis", format: "pdf",
            from: future, to: past, clinicId: null, filter: null, search: null);

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task ExportReport_ForwardsClinicIdAndFiltersToService()
    {
        var clinicId = Guid.NewGuid();
        _reportService.Setup(r => r.GenerateAsync(It.IsAny<ReportRequest>(), It.IsAny<CancellationToken>()))
                      .ReturnsAsync(new GeneratedReport(new byte[] { 1 }, "application/pdf", "x.pdf"));

        var result = await CreateController().ExportReport(
            reportType: "history", format: "pdf",
            from: null, to: null, clinicId: clinicId, filter: "checkin", search: "ana");

        result.Should().BeOfType<FileContentResult>();
        _reportService.Verify(r => r.GenerateAsync(It.Is<ReportRequest>(
            req => req.Type == ReportType.History &&
                   req.Format == ReportFormat.Pdf &&
                   req.ClinicId == clinicId &&
                   req.Filter == "checkin" &&
                   req.Search == "ana"), It.IsAny<CancellationToken>()), Times.Once);
    }
}
