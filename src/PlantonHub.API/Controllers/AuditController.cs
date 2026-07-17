using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Audit;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/audit")]
public class AuditController : ControllerBase
{
    private readonly IAuditService _service;

    public AuditController(IAuditService service)
    {
        _service = service;
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
}
