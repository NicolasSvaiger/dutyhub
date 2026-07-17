using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Justifications;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JustificationsController : ControllerBase
{
    private readonly IJustificationService _service;
    public JustificationsController(IJustificationService service) => _service = service;

    /// <summary>Listar acionamentos. AdminGlobal vê todos; AdminClinica só das próprias UPAs.</summary>
    [Authorize]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<JustificationResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll()
    {
        var result = await _service.GetAllAsync();
        return Ok(result);
    }

    /// <summary>Obter uma justificativa por id.</summary>
    [Authorize]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(JustificationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _service.GetByIdAsync(id);
        return result is null ? NotFound() : Ok(result);
    }

    /// <summary>Registrar novo acionamento (Prefeitura → OS). AdminClinica ou AdminGlobal.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost]
    [ProducesResponseType(typeof(JustificationResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateJustificationRequest request)
    {
        var result = await _service.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    /// <summary>Marcar como "Em análise". AdminClinica ou AdminGlobal.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost("{id:guid}/start-analysis")]
    [ProducesResponseType(typeof(JustificationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> StartAnalysis(Guid id)
    {
        var result = await _service.StartAnalysisAsync(id);
        return Ok(result);
    }

    /// <summary>Responder (aprovar ou reprovar). AdminClinica ou AdminGlobal.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost("{id:guid}/respond")]
    [ProducesResponseType(typeof(JustificationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Respond(Guid id, [FromBody] RespondJustificationRequest request)
    {
        var result = await _service.RespondAsync(id, request);
        return Ok(result);
    }
}
