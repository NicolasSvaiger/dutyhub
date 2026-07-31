using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Audit;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Reports;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/audit")]
public class AuditController : ControllerBase
{
    private readonly IAuditService _service;
    private readonly IReportService _reportService;

    // Teto de linhas na exportação — a auditoria pode ter volume alto e a
    // geração é CPU-bound (a guarda de 5 MB do ReportService complementa isto).
    private const int ExportMaxRows = 5000;
    private const int ExportPageSize = 200;

    public AuditController(IAuditService service, IReportService reportService)
    {
        _service = service;
        _reportService = reportService;
    }

    /// <summary>
    /// Timeline paginada de eventos, com filtros combináveis: período, usuário,
    /// módulo, tipo de operação e busca livre.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpGet("logs")]
    [ProducesResponseType(typeof(AuditLogPage), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetLogs(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] string? module = null,
        [FromQuery] string? operation = null,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 30)
    {
        var result = await _service.GetLogsAsync(from, to, userId, module, operation, search, page, pageSize);
        return Ok(result);
    }

    /// <summary>KPIs + agregações laterais (atividade por módulo, top usuários, série 7d).</summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpGet("summary")]
    [ProducesResponseType(typeof(AuditSummaryResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetSummary()
    {
        var summary = await _service.GetSummaryAsync();
        return Ok(summary);
    }

    /// <summary>
    /// Exporta a timeline de auditoria (PDF ou Excel) aplicando os mesmos
    /// filtros do GET logs. Limitado a <see cref="ExportMaxRows"/> linhas.
    /// format: "pdf" (padrão) ou "xlsx"/"excel".
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpGet("logs/export")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ExportLogs(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] string? module = null,
        [FromQuery] string? operation = null,
        [FromQuery] string? search = null,
        [FromQuery] string format = "pdf",
        CancellationToken ct = default)
    {
        // Junta as páginas (repo limita 200/página) até o teto de linhas.
        var items = new List<AuditLogEntry>();
        var page = 1;
        while (items.Count < ExportMaxRows)
        {
            var result = await _service.GetLogsAsync(from, to, userId, module, operation, search, page, ExportPageSize);
            items.AddRange(result.Items);
            if (result.Items.Count == 0 || page >= result.TotalPages) break;
            page++;
        }
        if (items.Count > ExportMaxRows) items = items.GetRange(0, ExportMaxRows);

        var fmt = format?.Trim().ToLowerInvariant() switch
        {
            "xlsx" or "excel" or "xls" => ReportFormat.Xlsx,
            _ => ReportFormat.Pdf,
        };

        var request = new ReportRequest
        {
            Type = ReportType.AuditLog,
            Format = fmt,
            From = from ?? (items.Count > 0 ? items[^1].Timestamp : DateTime.UtcNow),
            To = to ?? DateTime.UtcNow,
            Filter = module,
            Search = search,
        };

        var generated = await _reportService.GenerateFromPayloadAsync(request, items, ct);
        var ext = Path.GetExtension(generated.FileName);
        var fileName = $"auditoria-{DateTime.UtcNow:yyyy-MM-dd}{ext}";
        return File(generated.Bytes, generated.ContentType, fileName);
    }
}
