using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.ManagementReport;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/management-report")]
public class ManagementReportController : ControllerBase
{
    private readonly IManagementReportService _service;

    public ManagementReportController(IManagementReportService service)
    {
        _service = service;
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
}
