using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Users;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;

    public UsersController(IUserService userService)
    {
        _userService = userService;
    }

    /// <summary>
    /// Listar usuários administradores (AdminGlobal e AdminClinica).
    /// AdminGlobal: todos os admins.
    /// AdminClinica: apenas admins das mesmas clínicas.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpGet("admins")]
    [ProducesResponseType(typeof(IEnumerable<UserResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAdmins()
    {
        var users = await _userService.GetAdminUsersAsync();
        return Ok(users);
    }

    /// <summary>
    /// Listar usuários.
    /// AdminGlobal: todos os usuários.
    /// AdminClinica: apenas profissionais (Médico/Enfermeiro).
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<UserResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetAll()
    {
        var users = await _userService.GetAllAsync();
        return Ok(users);
    }

    /// <summary>
    /// Perfil completo do usuário autenticado. Diferente de /api/auth/session
    /// (que retorna só o essencial — userId, email, name, roles, clinicIds),
    /// esse endpoint devolve o UserResponse inteiro: CPF, telefone, registro
    /// profissional (CRM/COREN), especialidade, tipo de vínculo, data de
    /// nascimento e clinic roles. Consumido pela tela de perfil no app.
    /// </summary>
    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMe()
    {
        var user = await _userService.GetMeAsync();
        return user is null ? NotFound() : Ok(user);
    }

    /// <summary>
    /// Obter perfil de um usuário por ID.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var user = await _userService.GetByIdAsync(id);
        return user is null ? NotFound() : Ok(user);
    }

    /// <summary>
    /// Criar novo usuário.
    /// AdminGlobal e AdminClinica podem criar profissionais.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
    {
        var user = await _userService.CreateAsync(request);
        return CreatedAtAction(nameof(GetAll), new { id = user.Id }, user);
    }

    /// <summary>
    /// Atualizar dados de um usuário existente. Password permanece imutável
    /// por aqui — reset de senha é fluxo separado via Cognito (esqueci minha
    /// senha). Email pode ser alterado: o backend sincroniza o atributo com
    /// o Cognito (alias de login) e valida duplicidade antes de aplicar.
    /// AdminClinica só pode editar usuários que compartilham pelo menos uma
    /// clínica autorizada.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserRequest request)
    {
        var user = await _userService.UpdateAsync(id, request);
        return user is null ? NotFound() : Ok(user);
    }

    /// <summary>
    /// Atribuir perfil a um usuário em uma clínica.
    /// AdminClinica só pode atribuir para suas clínicas autorizadas.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPost("{id:guid}/clinic-role")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AssignClinicRole(Guid id, [FromBody] AssignRoleRequest request)
    {
        await _userService.AssignClinicRoleAsync(id, request);
        return Ok();
    }

    /// <summary>
    /// Alternar status ativo/inativo do usuário.
    /// </summary>
    [Authorize(Policy = "AdminClinica")]
    [HttpPatch("{id:guid}/toggle-status")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ToggleStatus(Guid id)
    {
        var user = await _userService.ToggleStatusAsync(id);
        return user is null ? NotFound() : Ok(user);
    }

}
