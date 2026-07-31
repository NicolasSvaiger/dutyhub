using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.ManagementReport;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Reports;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/management-report")]
public class ManagementReportController : ControllerBase
{
    private readonly IManagementReportService _service;
    private readonly IReportService _reportService;

    public ManagementReportController(IManagementReportService service, IReportService reportService)
    {
        _service = service;
        _reportService = reportService;
    }

    /// <summary>
    /// Retorna o relatório gerencial consolidado para um mês/ano.
    /// Quando year/month não são informados, usa o mês corrente.
    /// Restrito ao papel AdminGlobal — visão da OS por completo.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpGet]
    [ProducesResponseType(typeof(ManagementReportResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Get([FromQuery] int? year = null, [FromQuery] int? month = null)
    {
        var report = await _service.GetReportAsync(year, month);
        return Ok(report);
    }

    /// <summary>
    /// Exporta o relatório gerencial em PDF. Reusa o mesmo payload do GET
    /// (mês/ano corrente quando omitidos). Disponível apenas em PDF —
    /// o Gerencial não tem template Excel.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpGet("export")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Export(
        [FromQuery] int? year = null,
        [FromQuery] int? month = null,
        CancellationToken ct = default)
    {
        var report = await _service.GetReportAsync(year, month);

        var periodStart = new DateTime(report.Year, report.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var request = new ReportRequest
        {
            Type = ReportType.ManagementReport,
            Format = ReportFormat.Pdf,
            From = periodStart,
            To = periodStart.AddMonths(1).AddDays(-1),
        };

        var generated = await _reportService.GenerateFromPayloadAsync(request, report, ct);
        var ext = Path.GetExtension(generated.FileName);
        var fileName = $"relatorio-gerencial-{report.Year:D4}-{report.Month:D2}{ext}";
        return File(generated.Bytes, generated.ContentType, fileName);
    }

    /// <summary>
    /// Exporta o relatório gerencial em modo apresentação (PDF paisagem, estilo
    /// slides) para projetar em reunião. Mesmo payload/escopo do export normal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpGet("export/presentation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ExportPresentation(
        [FromQuery] int? year = null,
        [FromQuery] int? month = null,
        CancellationToken ct = default)
    {
        var report = await _service.GetReportAsync(year, month);

        var periodStart = new DateTime(report.Year, report.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var request = new ReportRequest
        {
            Type = ReportType.ManagementPresentation,
            Format = ReportFormat.Pdf,
            From = periodStart,
            To = periodStart.AddMonths(1).AddDays(-1),
        };

        var generated = await _reportService.GenerateFromPayloadAsync(request, report, ct);
        var ext = Path.GetExtension(generated.FileName);
        var fileName = $"apresentacao-gerencial-{report.Year:D4}-{report.Month:D2}{ext}";
        return File(generated.Bytes, generated.ContentType, fileName);
    }
}
