using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace PlantonHub.API.Controllers;

/// <summary>
/// Endpoints de notificações do usuário. Hoje serve apenas para
/// o UI (contador no sino) — retorna zero enquanto não há storage
/// de notificações. Estrutura pronta para ser preenchida quando
/// um serviço real for adicionado.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    public class UnreadCountResponse
    {
        public int Count { get; set; }
    }

    public class NotificationItemResponse
    {
        public Guid Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public bool IsRead { get; set; }
    }

    /// <summary>Contador de notificações não lidas do usuário logado.</summary>
    [Authorize]
    [HttpGet("unread-count")]
    [ProducesResponseType(typeof(UnreadCountResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult GetUnreadCount()
    {
        // Placeholder: substituir por um INotificationService quando existir.
        return Ok(new UnreadCountResponse { Count = 0 });
    }

    /// <summary>Lista as notificações mais recentes do usuário logado.</summary>
    [Authorize]
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<NotificationItemResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult GetAll()
    {
        // Placeholder: sem storage ainda, retorna lista vazia.
        return Ok(Array.Empty<NotificationItemResponse>());
    }
}
