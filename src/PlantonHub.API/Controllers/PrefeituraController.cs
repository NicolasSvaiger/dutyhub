using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PlantonHub.Application.DTOs.Prefeitura;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Reports;

namespace PlantonHub.API.Controllers;

/// <summary>
/// Portal Prefeitura — endpoints filtrados pelo escopo do gestor logado
/// (organ + descendentes → contratos ativos → clínicas). Sem organ
/// resolvido → 403 NO_ORGAN_CONTEXT. Sprint 7B.1 entregou os 8 reads,
/// Sprint 7B.2 adicionou notify-os + reports export.
/// Ver design.md § "Endpoints".
/// </summary>
[ApiController]
[Route("api/prefeitura")]
[Authorize(Policy = "GestorPublico")]
[EnableRateLimiting("Session")]
public class PrefeituraController : ControllerBase
{
    private readonly IPrefeituraService _service;
    private readonly IReportService _reportService;

    public PrefeituraController(IPrefeituraService service, IReportService reportService)
    {
        _service = service;
        _reportService = reportService;
    }

    /// <summary>KPIs do dia + resumo operacional + últimos alertas.</summary>
    [HttpGet("dashboard")]
    [ProducesResponseType(typeof(PrefeituraDashboardResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetDashboard(CancellationToken ct)
    {
        var response = await _service.GetDashboardAsync(ct);
        return Ok(response);
    }

    /// <summary>
    /// KPIs agregados no período. Defaults quando <c>from</c>/<c>to</c>
    /// omitidos: últimos 30 dias.
    /// </summary>
    [HttpGet("kpis")]
    [ProducesResponseType(typeof(PrefeituraKpisResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetKpis(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var (fromResolved, toResolved) = ResolveDefaultPeriod(from, to, defaultDays: 30);
        if (fromResolved > toResolved) return BadRequest(new { message = "from > to" });

        var response = await _service.GetKpisAsync(fromResolved, toResolved, ct);
        return Ok(response);
    }

    /// <summary>UPAs cobertas pelos contratos ativos — usa em dropdowns.</summary>
    [HttpGet("clinics")]
    [ProducesResponseType(typeof(IReadOnlyList<PrefeituraClinicItem>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetClinics(CancellationToken ct)
    {
        var response = await _service.GetClinicsAsync(ct);
        return Ok(response);
    }

    /// <summary>Escalas planejadas na semana. Filtro opcional por UPA.</summary>
    [HttpGet("shifts")]
    [ProducesResponseType(typeof(IReadOnlyList<PrefeituraShiftItem>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetShifts(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] Guid? clinicId,
        CancellationToken ct = default)
    {
        var (fromResolved, toResolved) = ResolveDefaultPeriod(from, to, defaultDays: 7);
        if (fromResolved > toResolved) return BadRequest(new { message = "from > to" });

        var response = await _service.GetShiftsAsync(fromResolved, toResolved, clinicId, ct);
        return Ok(response);
    }

    /// <summary>Frequência previsto x realizado.</summary>
    [HttpGet("frequency")]
    [ProducesResponseType(typeof(IReadOnlyList<PrefeituraFrequencyItem>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetFrequency(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] Guid? clinicId,
        CancellationToken ct = default)
    {
        var (fromResolved, toResolved) = ResolveDefaultPeriod(from, to, defaultDays: 30);
        if (fromResolved > toResolved) return BadRequest(new { message = "from > to" });

        var response = await _service.GetFrequencyAsync(fromResolved, toResolved, clinicId, ct);
        return Ok(response);
    }

    /// <summary>Ausências e/ou atrasos. Filtro <c>type</c>: "late" | "absence".</summary>
    [HttpGet("absences")]
    [ProducesResponseType(typeof(IReadOnlyList<PrefeituraAbsenceItem>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetAbsences(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? type,
        CancellationToken ct = default)
    {
        var (fromResolved, toResolved) = ResolveDefaultPeriod(from, to, defaultDays: 30);
        if (fromResolved > toResolved) return BadRequest(new { message = "from > to" });
        if (!IsValidAbsenceType(type)) return BadRequest(new { message = "type inválido" });

        var response = await _service.GetAbsencesAsync(fromResolved, toResolved, type, ct);
        return Ok(response);
    }

    /// <summary>Timeline paginada de eventos operacionais no escopo.</summary>
    [HttpGet("history")]
    [ProducesResponseType(typeof(PrefeituraHistoryPage), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetHistory(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? type,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 30,
        CancellationToken ct = default)
    {
        var (fromResolved, toResolved) = ResolveDefaultPeriod(from, to, defaultDays: 30);
        if (fromResolved > toResolved) return BadRequest(new { message = "from > to" });
        if (page < 1) return BadRequest(new { message = "page deve ser >= 1" });
        if (pageSize is < 1 or > 100) return BadRequest(new { message = "pageSize deve estar entre 1 e 100" });
        if (!IsValidHistoryType(type)) return BadRequest(new { message = "type inválido" });

        var response = await _service.GetHistoryAsync(fromResolved, toResolved, type, search, page, pageSize, ct);
        return Ok(response);
    }

    /// <summary>Snapshot ao vivo por UPA — consumido em polling pelo frontend.</summary>
    [HttpGet("realtime")]
    [ProducesResponseType(typeof(PrefeituraRealtimeResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetRealtime(CancellationToken ct)
    {
        var response = await _service.GetRealtimeAsync(ct);
        return Ok(response);
    }

    // ─────────────────────────────────────────────────────────────
    // Sprint 7B.2 — Acionar OS + Exportação PDF/Excel
    // ─────────────────────────────────────────────────────────────

    /// <summary>
    /// "Acionar OS": gestor sinaliza uma ausência crítica. Cria um Alert
    /// visível no Admin OS via <see cref="IAlertService"/>, sem alterar
    /// dados operacionais. Rate limit dedicado (5/min por gestor) evita
    /// spam contra a OS. Ver design.md § "Acionar OS".
    /// </summary>
    [HttpPost("absences/notify-os")]
    [EnableRateLimiting("PrefeituraNotifyOs")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> NotifyOs([FromBody] NotifyOsRequest request, CancellationToken ct)
    {
        if (request is null) return BadRequest(new { message = "body obrigatório" });
        if (request.ShiftId == Guid.Empty) return BadRequest(new { message = "shiftId obrigatório" });
        if (request.UserId == Guid.Empty) return BadRequest(new { message = "userId obrigatório" });

        var alertId = await _service.NotifyOsAboutAbsenceAsync(
            request.ShiftId, request.UserId, request.Message, ct);

        return Created($"/api/alerts/{alertId}", new
        {
            alertId,
            createdAt = DateTime.UtcNow,
        });
    }

    /// <summary>
    /// Exportação de relatório em PDF ou Excel. Filtros iguais aos
    /// endpoints de leitura correspondentes. Retorna <c>File(bytes)</c>
    /// com Content-Disposition. Se o binário passar do limite (5MB),
    /// retorna 413 com mensagem em pt-BR pedindo pra filtrar mais.
    /// Rate limit dedicado 10/min por gestor.
    /// Ver design.md § "Exportação PDF/Excel".
    /// </summary>
    [HttpGet("reports/{reportType}/export")]
    [EnableRateLimiting("PrefeituraExport")]
    [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status413RequestEntityTooLarge)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> ExportReport(
        string reportType,
        [FromQuery] string format,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] Guid? clinicId,
        [FromQuery] string? filter,
        [FromQuery] string? search,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<ReportType>(reportType, ignoreCase: true, out var type))
        {
            return BadRequest(new { message = $"reportType inválido: {reportType}" });
        }
        if (!Enum.TryParse<ReportFormat>(format, ignoreCase: true, out var fmt))
        {
            return BadRequest(new { message = $"format inválido: {format}" });
        }

        var (fromResolved, toResolved) = ResolveDefaultPeriod(from, to, defaultDays: 30);
        if (fromResolved > toResolved)
        {
            return BadRequest(new { message = "from > to" });
        }

        var report = await _reportService.GenerateAsync(new ReportRequest
        {
            Type = type,
            Format = fmt,
            From = fromResolved,
            To = toResolved,
            ClinicId = clinicId,
            Filter = filter,
            Search = search,
        }, ct);

        return File(report.Bytes, report.ContentType, report.FileName);
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private static (DateTime From, DateTime To) ResolveDefaultPeriod(DateTime? from, DateTime? to, int defaultDays)
    {
        // Ambos ausentes: últimos N dias até hoje (endpoint retorna janela útil).
        // Um só ausente: preserva o informado e completa o outro.
        var today = DateTime.SpecifyKind(DateTime.UtcNow.Date, DateTimeKind.Utc);
        if (from is null && to is null)
        {
            return (today.AddDays(-defaultDays), today.AddDays(1));
        }
        var f = from ?? (to!.Value.AddDays(-defaultDays));
        var t = to ?? f.AddDays(defaultDays);
        return (
            DateTime.SpecifyKind(f, DateTimeKind.Utc),
            DateTime.SpecifyKind(t, DateTimeKind.Utc));
    }

    private static bool IsValidAbsenceType(string? type) =>
        string.IsNullOrWhiteSpace(type) || type is "late" or "absence";

    private static bool IsValidHistoryType(string? type) =>
        string.IsNullOrWhiteSpace(type) ||
        type is "checkin" or "substitution" or "justification" or "alert";
}
