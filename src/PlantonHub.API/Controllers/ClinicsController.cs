using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Clinics;
using PlantonHub.Application.Interfaces;
namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ClinicsController : ControllerBase
{
    private readonly IClinicService _clinicService;

    public ClinicsController(IClinicService clinicService)
    {
        _clinicService = clinicService;
    }

    /// <summary>
    /// Listar clínicas. AdminGlobal vê todas, demais usuários veem apenas as autorizadas.
    /// </summary>
    [Authorize]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<ClinicResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetAll()
    {
        var clinics = await _clinicService.GetAllAsync();
        return Ok(clinics);
    }

    /// <summary>
    /// Criar nova clínica. Apenas AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPost]
    [ProducesResponseType(typeof(ClinicResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateClinicRequest request)
    {
        var clinic = await _clinicService.CreateAsync(request);
        return CreatedAtAction(nameof(GetAll), new { id = clinic.Id }, clinic);
    }

    /// <summary>
    /// Atualizar clínica existente. Apenas AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(ClinicResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateClinicRequest request)
    {
        var clinic = await _clinicService.UpdateAsync(id, request);
        return Ok(clinic);
    }

    /// <summary>
    /// Alternar status ativo/inativo da clínica. Apenas AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPatch("{id:guid}/toggle-status")]
    [ProducesResponseType(typeof(ClinicResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ToggleStatus(Guid id)
    {
        var clinic = await _clinicService.ToggleStatusAsync(id);
        return Ok(clinic);
    }

    /// <summary>
    /// Substituir todos os templates de turno de uma clínica. Apenas AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPut("{id:guid}/shift-templates")]
    [ProducesResponseType(typeof(ClinicResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpsertShiftTemplates(Guid id, [FromBody] UpsertShiftTemplatesRequest request)
    {
        var clinic = await _clinicService.UpsertShiftTemplatesAsync(id, request);
        return Ok(clinic);
    }

    /// <summary>
    /// Buscar clínicas mais próximas por coordenadas GPS.
    /// </summary>
    [Authorize(Policy = "Profissional")]
    [HttpGet("nearest")]
    [ProducesResponseType(typeof(IEnumerable<NearestClinicResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetNearest(
        [FromQuery] double latitude,
        [FromQuery] double longitude,
        [FromQuery] int limit = 5)
    {
        if (latitude < -90 || latitude > 90)
            return BadRequest(new { message = "Latitude inválida (deve estar entre -90 e 90)." });
        if (longitude < -180 || longitude > 180)
            return BadRequest(new { message = "Longitude inválida (deve estar entre -180 e 180)." });

        var clinics = await _clinicService.GetNearestAsync(latitude, longitude, limit);
        return Ok(clinics);
    }
}
