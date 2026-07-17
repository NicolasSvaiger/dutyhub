using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Alerts;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AlertsController : ControllerBase
{
    private readonly IAlertService _service;
    public AlertsController(IAlertService service) => _service = service;

    /// <summary>Lista alertas. AdminGlobal vê todos; AdminClinica só das próprias UPAs + globais.</summary>
    [Authorize]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<AlertResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll()
    {
        var result = await _service.GetAllAsync();
        return Ok(result);
    }

    /// <summary>KPIs consolidados (contagens por nível / hoje).</summary>
    [Authorize]
    [HttpGet("summary")]
    [ProducesResponseType(typeof(AlertsSummaryResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSummary()
    {
        var result = await _service.GetSummaryAsync();
        return Ok(result);
    }

    /// <summary>Obter alerta por id.</summary>
    [Authorize]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(AlertResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _service.GetByIdAsync(id);
        return result is null ? NotFound() : Ok(result);
    }

    /// <summary>Registrar novo alerta manualmente. AdminClinica ou AdminGlobal.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost]
    [ProducesResponseType(typeof(AlertResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateAlertRequest request)
    {
        var result = await _service.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    /// <summary>Marcar alerta como resolvido.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost("{id:guid}/resolve")]
    [ProducesResponseType(typeof(AlertResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Resolve(Guid id, [FromBody] ResolveAlertRequest? request)
    {
        var result = await _service.ResolveAsync(id, request);
        return Ok(result);
    }

    /// <summary>Marcar TODOS os alertas abertos como resolvidos. AdminClinica ou AdminGlobal.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost("resolve-all")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ResolveAll()
    {
        var count = await _service.ResolveAllAsync();
        return Ok(new { resolved = count });
    }
}
