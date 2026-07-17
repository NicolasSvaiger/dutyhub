using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
    [EnableRateLimiting("CheckIn")]
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
    /// Listar check-ins ativos (sem check-out) do profissional logado na clínica ativa.
    /// Usado pelo modal de check-out para saber quais plantões podem ser encerrados.
    /// </summary>
    [Authorize(Policy = "Profissional")]
    [HttpGet("active")]
    [ProducesResponseType(typeof(IEnumerable<AttendanceResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetMyActive()
    {
        var active = await _attendanceService.GetMyActiveAsync();
        return Ok(active);
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
    /// Estado unificado de attendance do profissional logado.
    /// Retorna numa só chamada: check-in ativo (se houver), shifts de hoje
    /// disponíveis, e as decisões canCheckIn/canCheckOut já calculadas.
    /// O frontend usa isso pra renderizar o modal sem lógica própria e sem
    /// múltiplas chamadas com race condition entre elas.
    /// </summary>
    [Authorize(Policy = "Profissional")]
    [HttpGet("status")]
    [ProducesResponseType(typeof(AttendanceStatusResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetStatus()
    {
        var status = await _attendanceService.GetStatusAsync();
        return Ok(status);
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

    /// <summary>
    /// Summary of attendance data for the current user.
    /// Aggregates: total days worked, total hours, absences (shifts without check-in).
    /// Supports optional date range filtering.
    /// </summary>
    [Authorize(Policy = "Profissional")]
    [HttpGet("summary")]
    [ProducesResponseType(typeof(AttendanceSummaryResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetSummary([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var summary = await _attendanceService.GetSummaryAsync(from, to);
        return Ok(summary);
    }

    /// <summary>
    /// Painel "Tempo Real" — status ao vivo de presença por UPA/turno hoje.
    /// AdminGlobal vê todas as UPAs; AdminClinica vê apenas as suas autorizadas.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpGet("live-status")]
    [ProducesResponseType(typeof(LiveStatusResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetLiveStatus()
    {
        var status = await _attendanceService.GetLiveStatusAsync();
        return Ok(status);
    }
}
