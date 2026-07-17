using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Availability;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AvailabilityController : ControllerBase
{
    private readonly IAvailabilityService _service;

    public AvailabilityController(IAvailabilityService service)
    {
        _service = service;
    }

    /// <summary>
    /// Visão consolidada da disponibilidade: uma linha por profissional visível
    /// para o admin logado, com todas as restrições + status computado hoje.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<ProfessionalAvailabilityResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetAll()
    {
        var result = await _service.GetProfessionalsAvailabilityAsync();
        return Ok(result);
    }

    /// <summary>Cria uma nova restrição de disponibilidade.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost("restrictions")]
    [ProducesResponseType(typeof(AvailabilityRestrictionResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CreateRestriction([FromBody] CreateAvailabilityRestrictionRequest request)
    {
        var restriction = await _service.CreateRestrictionAsync(request);
        return Created($"/api/availability/restrictions/{restriction.Id}", restriction);
    }

    /// <summary>Remove uma restrição existente.</summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpDelete("restrictions/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteRestriction(Guid id)
    {
        await _service.DeleteRestrictionAsync(id);
        return NoContent();
    }
}
