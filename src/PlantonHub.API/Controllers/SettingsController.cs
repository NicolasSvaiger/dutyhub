using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Settings;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/settings")]
[Authorize(Policy = "AdminClinica")]
public class SettingsController : ControllerBase
{
    private readonly ISettingsService _service;

    public SettingsController(ISettingsService service) => _service = service;

    /// <summary>
    /// Returns global tolerances and per-clinic tolerance overrides.
    /// Accessible by AdminGlobal and AdminClinica (read-only for the latter).
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(SettingsResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get()
    {
        var result = await _service.GetAsync();
        return Ok(result);
    }

    /// <summary>
    /// Updates global tolerances and per-clinic overrides. AdminGlobal only.
    /// </summary>
    [HttpPut]
    [Authorize(Policy = "AdminGlobal")]
    [ProducesResponseType(typeof(SettingsResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Update([FromBody] UpdateSettingsRequest request)
    {
        var result = await _service.UpdateAsync(request);
        return Ok(result);
    }
}
