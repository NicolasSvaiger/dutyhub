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
    /// Listar todos os usuários. Apenas AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
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
    /// Obter perfil de um usuário por ID. Apenas AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var user = await _userService.GetByIdAsync(id);
        if (user is null)
        {
            return NotFound();
        }
        return Ok(user);
    }

    /// <summary>
    /// Criar novo usuário. Apenas AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPost]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
    {
        var user = await _userService.CreateAsync(request);
        return CreatedAtAction(nameof(GetAll), new { id = user.Id }, user);
    }

    /// <summary>
    /// Atribuir perfil a um usuário em uma clínica. Apenas AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPost("{id:guid}/clinic-role")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AssignClinicRole(Guid id, [FromBody] AssignRoleRequest request)
    {
        await _userService.AssignClinicRoleAsync(id, request);
        return Ok();
    }

    /// <summary>
    /// Alternar status ativo/inativo do usuário. Apenas AdminGlobal.
    /// </summary>
    [Authorize(Policy = "AdminGlobal")]
    [HttpPatch("{id:guid}/toggle-status")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ToggleStatus(Guid id)
    {
        var user = await _userService.ToggleStatusAsync(id);
        if (user is null)
        {
            return NotFound();
        }
        return Ok(user);
    }

    /// <summary>
    /// Autocadastro de profissional (público — sem autenticação).
    /// O profissional se registra sozinho e aguarda vinculação a UPAs pelo admin.
    /// </summary>
    [AllowAnonymous]
    [HttpPost("self-register")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SelfRegister([FromBody] SelfRegisterRequest request)
    {
        var user = await _userService.SelfRegisterAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, user);
    }
}
