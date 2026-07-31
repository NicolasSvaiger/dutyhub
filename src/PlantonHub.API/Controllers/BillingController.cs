using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Billing;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Reports;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BillingController : ControllerBase
{
    private readonly IBillingService _service;
    private readonly IReportService _reportService;

    public BillingController(IBillingService service, IReportService reportService)
    {
        _service = service;
        _reportService = reportService;
    }

    /// <summary>
    /// Relatório de faturamento consolidado do mês.
    /// AdminGlobal vê todos os contratos; AdminClinica apenas os das suas UPAs.
    /// </summary>
    [Authorize]
    [HttpGet("report")]
    [ProducesResponseType(typeof(BillingReportResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetReport([FromQuery] int year, [FromQuery] int month)
    {
        var now = DateTime.UtcNow;
        if (year <= 0) year = now.Year;
        if (month <= 0) month = now.Month;

        var report = await _service.GetReportAsync(year, month);
        return Ok(report);
    }

    /// <summary>
    /// Exporta o relatório de faturamento do mês em PDF ou Excel.
    /// format: "pdf" (padrão) ou "xlsx"/"excel". Mesmo escopo do GET report
    /// (AdminGlobal vê tudo; AdminClinica só as suas UPAs).
    /// </summary>
    [Authorize]
    [HttpGet("report/export")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ExportReport(
        [FromQuery] int year,
        [FromQuery] int month,
        [FromQuery] string format = "pdf",
        CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        if (year <= 0) year = now.Year;
        if (month <= 0) month = now.Month;

        var report = await _service.GetReportAsync(year, month);

        var fmt = format?.Trim().ToLowerInvariant() switch
        {
            "xlsx" or "excel" or "xls" => ReportFormat.Xlsx,
            _ => ReportFormat.Pdf,
        };

        var periodStart = new DateTime(report.Year, report.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var request = new ReportRequest
        {
            Type = ReportType.Billing,
            Format = fmt,
            From = periodStart,
            To = periodStart.AddMonths(1).AddDays(-1),
        };

        var generated = await _reportService.GenerateFromPayloadAsync(request, report, ct);
        var ext = Path.GetExtension(generated.FileName);
        var fileName = $"relatorio-faturamento-{report.Year:D4}-{report.Month:D2}{ext}";
        return File(generated.Bytes, generated.ContentType, fileName);
    }
}
