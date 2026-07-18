using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PlantonHub.Application.DTOs.Gestores;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

/// <summary>
/// Admin OS — CRUD de gestores públicos (usuários vinculados a
/// <c>PublicOrgan</c> com role <c>GestorPublico</c>). Divide a superfície
/// entre listagem (AdminClinica + AdminGlobal, pra ambos verem quem
/// tem acesso ao Portal Prefeitura das suas UPAs) e escrita
/// (AdminGlobal apenas — cadastro exclusivo 24p7).
///
/// Escopo é orquestrado pelo <c>IGestorService</c>, que também toca
/// no Cognito (criar user + email de convite) via
/// <c>ICognitoAuthService.CreateInvitedUserAsync</c>. Todos os endpoints
/// pertencem à policy padrão de rate limit <c>Session</c>.
/// </summary>
[ApiController]
[Route("api/admin/gestores")]
[EnableRateLimiting("Session")]
public class AdminGestoresController : ControllerBase
{
    private readonly IGestorService _gestorService;

    public AdminGestoresController(IGestorService gestorService)
    {
        _gestorService = gestorService;
    }

    /// <summary>
    /// Lista gestores cadastrados, opcionalmente filtrados por
    /// <paramref name="publicOrganId"/>. Visível a AdminGlobal e
    /// AdminClinica (a OS precisa saber quem opera cada prefeitura).
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<GestorResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? publicOrganId = null)
    {
        var gestores = await _gestorService.GetAllAsync(publicOrganId);
        return Ok(gestores);
    }

    /// <summary>
    /// Detalhe de um gestor específico.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(GestorResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var gestor = await _gestorService.GetByIdAsync(id);
        return gestor is null ? NotFound() : Ok(gestor);
    }

    /// <summary>
    /// Cadastra um novo gestor. Cria User no Postgres + user no Cognito
    /// (com senha temporária + email de convite) + vínculo
    /// <c>UserPublicOrganRole</c>. Rollback compensatório se qualquer
    /// etapa falha. Somente AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPost]
    [ProducesResponseType(typeof(GestorResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create([FromBody] CreateGestorRequest request)
    {
        var gestor = await _gestorService.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = gestor.Id }, gestor);
    }

    /// <summary>
    /// Atualiza campos editáveis do gestor. Email e vínculo com o
    /// PublicOrgan são imutáveis. Somente AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(GestorResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGestorRequest request)
    {
        var gestor = await _gestorService.UpdateAsync(id, request);
        return gestor is null ? NotFound() : Ok(gestor);
    }

    /// <summary>
    /// Alterna <c>IsActive</c> do gestor. Inativo perde acesso ao portal
    /// no próximo request. Somente AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPatch("{id:guid}/toggle-status")]
    [ProducesResponseType(typeof(GestorResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ToggleStatus(Guid id)
    {
        var gestor = await _gestorService.ToggleStatusAsync(id);
        return gestor is null ? NotFound() : Ok(gestor);
    }

    /// <summary>
    /// Remove o vínculo <c>UserPublicOrganRole</c>. O <c>User</c> é
    /// preservado (LGPD — audit trail). Somente AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Remove(Guid id)
    {
        await _gestorService.RemoveAsync(id);
        return NoContent();
    }
}
