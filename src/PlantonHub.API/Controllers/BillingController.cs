using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Billing;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BillingController : ControllerBase
{
    private readonly IBillingService _service;
    public BillingController(IBillingService service) => _service = service;

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
}
