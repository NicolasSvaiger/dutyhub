using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Substitutions;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SubstitutionsController : ControllerBase
{
    private readonly ISubstitutionService _service;
    public SubstitutionsController(ISubstitutionService service) => _service = service;

    /// <summary>
    /// Listar substituições.
    /// AdminGlobal: todas. AdminClinica: apenas das suas UPAs.
    /// </summary>
    [Authorize]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<SubstitutionResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll()
    {
        var result = await _service.GetAllAsync();
        return Ok(result);
    }

    /// <summary>Obter uma substituição por id.</summary>
    [Authorize]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(SubstitutionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _service.GetByIdAsync(id);
        return result is null ? NotFound() : Ok(result);
    }

    /// <summary>Registrar uma nova substituição. AdminClinica (própria UPA) ou AdminGlobal.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost]
    [ProducesResponseType(typeof(SubstitutionResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateSubstitutionRequest request)
    {
        var result = await _service.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    /// <summary>Designar (ou substituir) o profissional substituto. AdminClinica ou AdminGlobal.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost("{id:guid}/assign")]
    [ProducesResponseType(typeof(SubstitutionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> AssignSubstitute(Guid id, [FromBody] AssignSubstituteRequest request)
    {
        var result = await _service.AssignSubstituteAsync(id, request);
        return Ok(result);
    }

    /// <summary>Cancelar uma substituição. AdminClinica ou AdminGlobal.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost("{id:guid}/cancel")]
    [ProducesResponseType(typeof(SubstitutionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var result = await _service.CancelAsync(id);
        return Ok(result);
    }
}
