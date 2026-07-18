using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Prefeitura;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Reports;
using PlantonHub.Application.Services;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Sprint 7B.2 — cobre <see cref="ReportService"/>: seleção do generator
/// correto por (Type, Format), delegação ao <see cref="IPrefeituraService"/>
/// pra buscar payload agregado, sanidade do binário (5MB), nomeação de
/// arquivo padronizada.
/// </summary>
public class ReportServiceTests
{
    private readonly Mock<IPrefeituraService> _prefeitura = new();

    private static IReportGenerator FakeGenerator(
        ReportType type,
        ReportFormat format,
        byte[]? bytes = null,
        string contentType = "application/pdf",
        string extension = "pdf")
    {
        var mock = new Mock<IReportGenerator>();
        mock.SetupGet(g => g.Type).Returns(type);
        mock.SetupGet(g => g.Format).Returns(format);
        mock.SetupGet(g => g.ContentType).Returns(contentType);
        mock.SetupGet(g => g.FileExtension).Returns(extension);
        mock.Setup(g => g.Generate(It.IsAny<object>(), It.IsAny<ReportRequest>()))
            .Returns(bytes ?? new byte[] { 1, 2, 3 });
        return mock.Object;
    }

    // ─────────────────────────────────────────────────────────────
    // Roteamento (Type × Format)
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GenerateAsync_KpisPdf_CallsGetKpisAndReturnsBytes()
    {
        var generator = FakeGenerator(ReportType.Kpis, ReportFormat.Pdf,
            bytes: new byte[] { 10, 20 });
        _prefeitura.Setup(p => p.GetKpisAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                               It.IsAny<CancellationToken>()))
                   .ReturnsAsync(new PrefeituraKpisResponse());

        var service = new ReportService(_prefeitura.Object, new[] { generator });
        var result = await service.GenerateAsync(new ReportRequest
        {
            Type = ReportType.Kpis, Format = ReportFormat.Pdf,
            From = DateTime.UtcNow.AddDays(-7), To = DateTime.UtcNow,
        });

        result.Bytes.Should().Equal(new byte[] { 10, 20 });
        result.ContentType.Should().Be("application/pdf");
        result.FileName.Should().StartWith("kpis-").And.EndWith(".pdf");
        _prefeitura.Verify(p => p.GetKpisAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                                It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GenerateAsync_FrequencyXlsx_CallsGetFrequency()
    {
        var generator = FakeGenerator(ReportType.Frequency, ReportFormat.Xlsx,
            extension: "xlsx",
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        _prefeitura.Setup(p => p.GetFrequencyAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                                    It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
                   .ReturnsAsync(Array.Empty<PrefeituraFrequencyItem>());

        var service = new ReportService(_prefeitura.Object, new[] { generator });
        var clinicId = Guid.NewGuid();
        var result = await service.GenerateAsync(new ReportRequest
        {
            Type = ReportType.Frequency, Format = ReportFormat.Xlsx,
            From = DateTime.UtcNow.AddDays(-7), To = DateTime.UtcNow,
            ClinicId = clinicId,
        });

        result.FileName.Should().EndWith(".xlsx");
        _prefeitura.Verify(p => p.GetFrequencyAsync(
            It.IsAny<DateTime>(), It.IsAny<DateTime>(), clinicId, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task GenerateAsync_AtrasosForcesLateFilterInAbsences()
    {
        var generator = FakeGenerator(ReportType.Atrasos, ReportFormat.Pdf);
        _prefeitura.Setup(p => p.GetAbsencesAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                                   It.IsAny<string?>(), It.IsAny<CancellationToken>()))
                   .ReturnsAsync(Array.Empty<PrefeituraAbsenceItem>());

        var service = new ReportService(_prefeitura.Object, new[] { generator });
        await service.GenerateAsync(new ReportRequest
        {
            Type = ReportType.Atrasos, Format = ReportFormat.Pdf,
            From = DateTime.UtcNow.AddDays(-7), To = DateTime.UtcNow,
        });

        // Mesmo com Filter no request, Atrasos força "late" internamente.
        _prefeitura.Verify(p => p.GetAbsencesAsync(
            It.IsAny<DateTime>(), It.IsAny<DateTime>(), "late", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task GenerateAsync_AusenciasForcesAbsenceFilter()
    {
        var generator = FakeGenerator(ReportType.Ausencias, ReportFormat.Xlsx, extension: "xlsx");
        _prefeitura.Setup(p => p.GetAbsencesAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                                   It.IsAny<string?>(), It.IsAny<CancellationToken>()))
                   .ReturnsAsync(Array.Empty<PrefeituraAbsenceItem>());

        var service = new ReportService(_prefeitura.Object, new[] { generator });
        await service.GenerateAsync(new ReportRequest
        {
            Type = ReportType.Ausencias, Format = ReportFormat.Xlsx,
            From = DateTime.UtcNow.AddDays(-7), To = DateTime.UtcNow,
        });

        _prefeitura.Verify(p => p.GetAbsencesAsync(
            It.IsAny<DateTime>(), It.IsAny<DateTime>(), "absence", It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task GenerateAsync_History_ForwardsFilterAndSearch()
    {
        var generator = FakeGenerator(ReportType.History, ReportFormat.Pdf);
        _prefeitura.Setup(p => p.GetHistoryAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                                  It.IsAny<string?>(), It.IsAny<string?>(),
                                                  It.IsAny<int>(), It.IsAny<int>(),
                                                  It.IsAny<CancellationToken>()))
                   .ReturnsAsync(new PrefeituraHistoryPage());

        var service = new ReportService(_prefeitura.Object, new[] { generator });
        await service.GenerateAsync(new ReportRequest
        {
            Type = ReportType.History, Format = ReportFormat.Pdf,
            From = DateTime.UtcNow.AddDays(-30), To = DateTime.UtcNow,
            Filter = "checkin", Search = "ana",
        });

        _prefeitura.Verify(p => p.GetHistoryAsync(
            It.IsAny<DateTime>(), It.IsAny<DateTime>(),
            "checkin", "ana", 1, 500, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    // ─────────────────────────────────────────────────────────────
    // Error paths
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GenerateAsync_NoGeneratorRegistered_ThrowsBadRequest()
    {
        // Sem generators — combo (Kpis, Xlsx) não existe.
        var service = new ReportService(_prefeitura.Object, Array.Empty<IReportGenerator>());

        var act = () => service.GenerateAsync(new ReportRequest
        {
            Type = ReportType.Kpis, Format = ReportFormat.Xlsx,
            From = DateTime.UtcNow.AddDays(-7), To = DateTime.UtcNow,
        });

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task GenerateAsync_BytesExceedLimit_ThrowsPayloadTooLarge()
    {
        // Payload de 6MB, acima do limite de 5MB do service.
        var oversized = new byte[6 * 1024 * 1024];
        var generator = FakeGenerator(ReportType.Kpis, ReportFormat.Pdf, bytes: oversized);
        _prefeitura.Setup(p => p.GetKpisAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                               It.IsAny<CancellationToken>()))
                   .ReturnsAsync(new PrefeituraKpisResponse());

        var service = new ReportService(_prefeitura.Object, new[] { generator });

        var act = () => service.GenerateAsync(new ReportRequest
        {
            Type = ReportType.Kpis, Format = ReportFormat.Pdf,
            From = DateTime.UtcNow.AddDays(-7), To = DateTime.UtcNow,
        });

        await act.Should().ThrowAsync<PayloadTooLargeException>()
            .WithMessage("*MB*");
    }

    [Fact]
    public async Task GenerateAsync_WrongGeneratorForFormat_PicksTheRightOne()
    {
        // 2 generators: um PDF, um XLSX. Deve escolher pelo Format.
        var pdfGen = FakeGenerator(ReportType.Kpis, ReportFormat.Pdf,
            bytes: new byte[] { 1 }, extension: "pdf", contentType: "application/pdf");
        var xlsxGen = FakeGenerator(ReportType.Kpis, ReportFormat.Xlsx,
            bytes: new byte[] { 2 }, extension: "xlsx",
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        _prefeitura.Setup(p => p.GetKpisAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                               It.IsAny<CancellationToken>()))
                   .ReturnsAsync(new PrefeituraKpisResponse());

        var service = new ReportService(_prefeitura.Object, new[] { pdfGen, xlsxGen });
        var result = await service.GenerateAsync(new ReportRequest
        {
            Type = ReportType.Kpis, Format = ReportFormat.Xlsx,
            From = DateTime.UtcNow.AddDays(-7), To = DateTime.UtcNow,
        });

        result.Bytes.Should().Equal(new byte[] { 2 });
        result.FileName.Should().EndWith(".xlsx");
    }

    [Fact]
    public void MaxOutputBytes_IsFiveMegabytes()
    {
        var service = new ReportService(_prefeitura.Object, Array.Empty<IReportGenerator>());
        service.MaxOutputBytes.Should().Be(5 * 1024 * 1024);
    }

    [Fact]
    public async Task GenerateAsync_FilenameIncludesFromDate()
    {
        var generator = FakeGenerator(ReportType.Kpis, ReportFormat.Pdf);
        _prefeitura.Setup(p => p.GetKpisAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                                               It.IsAny<CancellationToken>()))
                   .ReturnsAsync(new PrefeituraKpisResponse());

        var service = new ReportService(_prefeitura.Object, new[] { generator });
        var from = new DateTime(2026, 3, 15, 0, 0, 0, DateTimeKind.Utc);
        var result = await service.GenerateAsync(new ReportRequest
        {
            Type = ReportType.Kpis, Format = ReportFormat.Pdf,
            From = from, To = from.AddDays(30),
        });

        result.FileName.Should().Be("kpis-2026-03-15.pdf");
    }
}
