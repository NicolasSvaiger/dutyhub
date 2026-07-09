using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AttendanceController : ControllerBase
{
    private readonly IAttendanceService _attendanceService;
    private readonly IAttendanceSyncService _attendanceSyncService;

    public AttendanceController(
        IAttendanceService attendanceService,
        IAttendanceSyncService attendanceSyncService)
    {
        _attendanceService = attendanceService;
        _attendanceSyncService = attendanceSyncService;
    }

    /// <summary>
    /// Registrar check-in de presença. Apenas profissionais (Medico, Enfermeiro, Tecnico).
    /// </summary>
    [Authorize(Policy = "Profissional")]
    [HttpPost("check-in")]
    [ProducesResponseType(typeof(AttendanceResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CheckIn([FromBody] CheckInRequest request)
    {
        var attendance = await _attendanceService.CheckInAsync(request);
        return CreatedAtAction(nameof(GetMyHistory), new { id = attendance.Id }, attendance);
    }

    /// <summary>
    /// Registrar check-out de presença. Apenas profissionais (Medico, Enfermeiro, Tecnico).
    /// </summary>
    [Authorize(Policy = "Profissional")]
    [HttpPost("check-out")]
    [ProducesResponseType(typeof(AttendanceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CheckOut([FromBody] CheckOutRequest request)
    {
        var attendance = await _attendanceService.CheckOutAsync(request);
        return Ok(attendance);
    }

    /// <summary>
    /// Consultar histórico de presença do profissional na clínica ativa.
    /// </summary>
    [Authorize(Policy = "Profissional")]
    [HttpGet("my-history")]
    [ProducesResponseType(typeof(IEnumerable<AttendanceResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetMyHistory()
    {
        var history = await _attendanceService.GetMyHistoryAsync();
        return Ok(history);
    }

    /// <summary>
    /// Sincronizar batch de eventos offline de check-in/check-out.
    /// Processa cada evento individualmente e retorna status por evento.
    /// Garante idempotência via (LocalEventId + UserId + DeviceId).
    /// </summary>
    [Authorize]
    [HttpPost("sync")]
    [ProducesResponseType(typeof(SyncResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> SyncOfflineEvents([FromBody] OfflineEventSyncRequest request)
    {
        if (request.Events is null || request.Events.Count == 0)
        {
            return BadRequest(new { message = "A lista de eventos não pode estar vazia." });
        }

        var response = await _attendanceSyncService.SyncOfflineEventsAsync(request);
        return Ok(response);
    }
}
