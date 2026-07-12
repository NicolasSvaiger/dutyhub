using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.PublicOrgans;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PublicOrgansController : ControllerBase
{
    private readonly IPublicOrganService _service;
    public PublicOrgansController(IPublicOrganService service) => _service = service;

    /// <summary>
    /// List all public organs (prefeituras / subprefeituras).
    /// AdminGlobal sees all; AdminClinica sees those linked to their contracts.
    /// </summary>
    [Authorize]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<PublicOrganResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll()
    {
        var result = await _service.GetAllAsync();
        return Ok(result);
    }

    /// <summary>Get a single public organ by id.</summary>
    [Authorize]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(PublicOrganResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _service.GetByIdAsync(id);
        return result is null ? NotFound() : Ok(result);
    }
}
