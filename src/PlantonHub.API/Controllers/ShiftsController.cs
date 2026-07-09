using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Shifts;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ShiftsController : ControllerBase
{
    private readonly IShiftService _shiftService;

    public ShiftsController(IShiftService shiftService)
    {
        _shiftService = shiftService;
    }

    /// <summary>
    /// Listar plantões. Filtrado por perfil e tenant internamente pelo serviço.
    /// </summary>
    [Authorize]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<ShiftResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetAll()
    {
        var shifts = await _shiftService.GetAllAsync();
        return Ok(shifts);
    }

    /// <summary>
    /// Criar novo plantão. Apenas AdminClinica.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost]
    [ProducesResponseType(typeof(ShiftResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateShiftRequest request)
    {
        var shift = await _shiftService.CreateAsync(request);
        return CreatedAtAction(nameof(GetAll), new { id = shift.Id }, shift);
    }

    /// <summary>
    /// Atribuir profissional a um plantão. Apenas AdminClinica.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost("{id}/assign")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AssignProfessional(Guid id, [FromBody] AssignShiftRequest request)
    {
        await _shiftService.AssignProfessionalAsync(id, request);
        return Ok();
    }
}
