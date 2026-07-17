using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PlantonHub.Application.DTOs.Auth;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.API.Controllers;

/// <summary>
/// Auth controller — handles session validation, face-login, device management, and token blacklisting.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly ITokenBlacklistService _tokenBlacklistService;
    private readonly ITenantService _tenantService;
    private readonly IFaceVerificationService _faceVerificationService;
    private readonly IFaceEnrollmentRepository _faceEnrollmentRepository;
    private readonly IDeviceRegistrationRepository _deviceRegistrationRepository;
    private readonly ICognitoAuthService _cognitoAuthService;
    private readonly IUserRepository _userRepository;

    public AuthController(
        ITokenBlacklistService tokenBlacklistService,
        ITenantService tenantService,
        IFaceVerificationService faceVerificationService,
        IFaceEnrollmentRepository faceEnrollmentRepository,
        IDeviceRegistrationRepository deviceRegistrationRepository,
        ICognitoAuthService cognitoAuthService,
        IUserRepository userRepository)
    {
        _tokenBlacklistService = tokenBlacklistService;
        _tenantService = tenantService;
        _faceVerificationService = faceVerificationService;
        _faceEnrollmentRepository = faceEnrollmentRepository;
        _deviceRegistrationRepository = deviceRegistrationRepository;
        _cognitoAuthService = cognitoAuthService;
        _userRepository = userRepository;
    }

    /// <summary>
    /// Login using email + face verification.
    /// The email identifies the user, the facial embedding proves their identity.
    /// Also registers/validates the device (single device lock).
    /// </summary>
    [HttpPost("face-login")]
    [AllowAnonymous]
    [EnableRateLimiting("FaceLogin")]
    [ProducesResponseType(typeof(FaceLoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> FaceLogin([FromBody] FaceLoginRequest request)
    {
        // 1. Resolve email → local user
        var user = await _userRepository.GetByEmailAsync(request.Email);
        if (user is null)
            return Unauthorized(new { message = "Credenciais inválidas." });

        // 1.1 Face-login is only for professionals (Medico, Enfermeiro, Tecnico)
        // Admins must use email/password via Cognito SDK
        var userRoles = user.UserClinicRoles.Select(r => r.Role).Distinct().ToList();
        var isAdmin = userRoles.Any(r => r == Domain.Enums.RoleType.AdminGlobal || r == Domain.Enums.RoleType.AdminClinica);
        var isProfessional = userRoles.Any(r => r == Domain.Enums.RoleType.Medico || r == Domain.Enums.RoleType.Enfermeiro || r == Domain.Enums.RoleType.Tecnico);

        if (!isProfessional || isAdmin)
            return BadRequest(new { message = "Face-login disponível apenas para profissionais. Administradores devem usar login por senha." });

        // 2. Check if user has face enrollment
        var hasEnrollment = await _faceEnrollmentRepository.HasEnrollmentAsync(user.Id);
        if (!hasEnrollment)
            return Unauthorized(new { message = "Cadastro biométrico não encontrado. Solicite ao administrador." });

        // 3. Verify face (1:1 — we know who they claim to be via email)
        var verifyResult = await _faceVerificationService.VerifyAsync(user.Id, request.Embedding);
        if (!verifyResult.IsMatch)
            return Unauthorized(new { message = "Verificação facial falhou. Tente novamente.", confidence = verifyResult.Confidence });

        // 4. Device lock validation
        var activeDevice = await _deviceRegistrationRepository.GetActiveByUserIdAsync(user.Id);

        if (activeDevice is not null && activeDevice.DeviceId != request.DeviceId)
        {
            // Different device — block login
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                message = "Sua conta está vinculada a outro dispositivo. Solicite o desvínculo ao administrador ou utilize a opção de troca de dispositivo.",
                code = "DEVICE_LOCKED",
                currentDevice = new
                {
                    platform = activeDevice.Platform,
                    model = activeDevice.DeviceModel,
                    registeredAt = activeDevice.RegisteredAt,
                },
            });
        }

        // 5. Register device if first login or same device
        if (activeDevice is null)
        {
            var registration = new DeviceRegistration
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                DeviceId = request.DeviceId,
                Platform = request.Platform,
                DeviceModel = request.DeviceModel,
                IsActive = true,
                RegisteredAt = DateTime.UtcNow,
            };
            await _deviceRegistrationRepository.AddAsync(registration);
        }

        // 6. Authenticate via Cognito (service-managed password)
        var cognitoResult = await _cognitoAuthService.AuthenticateAsync(request.Email);

        return Ok(new FaceLoginResponse
        {
            IdToken = cognitoResult.IdToken,
            AccessToken = cognitoResult.AccessToken,
            RefreshToken = cognitoResult.RefreshToken,
            ExpiresIn = cognitoResult.ExpiresIn,
            UserId = user.Id,
            Email = user.Email,
            Name = user.Name,
        });
    }

    /// <summary>
    /// Reset device — self-service: the authenticated user unlinks their own device.
    /// Requires the current token (meaning they are logged in on their current device).
    /// A reason is required for audit trail.
    /// </summary>
    [HttpPost("reset-device")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ResetDeviceSelf([FromBody] ResetDeviceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { message = "Motivo é obrigatório para auditoria." });

        var userId = _tenantService.GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var activeDevice = await _deviceRegistrationRepository.GetActiveByUserIdAsync(userId.Value);
        if (activeDevice is null)
            return BadRequest(new { message = "Nenhum dispositivo vinculado." });

        // Deactivate and audit
        await _deviceRegistrationRepository.DeactivateAllForUserAsync(userId.Value);

        var audit = new DeviceUnlinkAudit
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            OldDeviceId = activeDevice.DeviceId,
            Platform = activeDevice.Platform,
            DeviceModel = activeDevice.DeviceModel,
            UnlinkedBy = "self",
            Reason = request.Reason,
            UnlinkedAt = DateTime.UtcNow,
        };
        await _deviceRegistrationRepository.AddUnlinkAuditAsync(audit);

        return NoContent();
    }

    /// <summary>
    /// Admin: reset device for a specific user.
    /// </summary>
    [HttpPost("reset-device/{userId:guid}")]
    [Authorize(Policy = "AdminClinica")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ResetDeviceAdmin(Guid userId, [FromBody] ResetDeviceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { message = "Motivo é obrigatório para auditoria." });

        if (!await _tenantService.CanOperateOnUserAsync(userId))
            return Forbid();

        var activeDevice = await _deviceRegistrationRepository.GetActiveByUserIdAsync(userId);
        if (activeDevice is null)
            return NotFound(new { message = "Nenhum dispositivo vinculado para este usuário." });

        var adminUserId = _tenantService.GetCurrentUserId();

        // Deactivate and audit
        await _deviceRegistrationRepository.DeactivateAllForUserAsync(userId);

        var audit = new DeviceUnlinkAudit
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            OldDeviceId = activeDevice.DeviceId,
            Platform = activeDevice.Platform,
            DeviceModel = activeDevice.DeviceModel,
            UnlinkedBy = $"admin:{adminUserId}",
            Reason = request.Reason,
            UnlinkedAt = DateTime.UtcNow,
        };
        await _deviceRegistrationRepository.AddUnlinkAuditAsync(audit);

        return NoContent();
    }

    /// <summary>
    /// Admin: view device unlink history for a user (audit trail).
    /// </summary>
    [HttpGet("device-audit/{userId:guid}")]
    [Authorize(Policy = "AdminClinica")]
    [ProducesResponseType(typeof(IEnumerable<DeviceUnlinkAuditResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetDeviceAudit(Guid userId)
    {
        if (!await _tenantService.CanOperateOnUserAsync(userId))
            return Forbid();

        var history = await _deviceRegistrationRepository.GetUnlinkHistoryAsync(userId);

        var response = history.Select(a => new DeviceUnlinkAuditResponse
        {
            Id = a.Id,
            UserId = a.UserId,
            OldDeviceId = a.OldDeviceId,
            Platform = a.Platform,
            DeviceModel = a.DeviceModel,
            UnlinkedBy = a.UnlinkedBy,
            Reason = a.Reason,
            UnlinkedAt = a.UnlinkedAt,
        });

        return Ok(response);
    }

    /// <summary>
    /// Admin: set up face-login for a professional by ensuring they exist in Cognito.
    /// No password is needed — CUSTOM_AUTH flow handles authentication via HMAC challenge.
    /// Call this after creating a new professional user.
    /// </summary>
    [HttpPost("setup-face-login/{userId:guid}")]
    [Authorize(Policy = "AdminClinica")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetupFaceLogin(Guid userId)
    {
        if (!await _tenantService.CanOperateOnUserAsync(userId))
            return Forbid();

        var user = await _userRepository.GetByIdAsync(userId);
        if (user is null)
            return NotFound(new { message = "Usuário não encontrado." });

        // Only for professionals
        var roles = user.UserClinicRoles.Select(r => r.Role).Distinct().ToList();
        var isProfessional = roles.Any(r =>
            r == Domain.Enums.RoleType.Medico ||
            r == Domain.Enums.RoleType.Enfermeiro ||
            r == Domain.Enums.RoleType.Tecnico);

        if (!isProfessional)
            return BadRequest(new { message = "Face-login só pode ser configurado para profissionais (Médico, Enfermeiro, Técnico)." });

        await _cognitoAuthService.EnsureUserExistsAsync(user.Email);

        return NoContent();
    }

    /// <summary>
    /// Validate the current token and return user info.
    /// Used by the Flutter app to check if the session is still valid on app launch.
    /// </summary>
    [HttpGet("session")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult GetSession()
    {
        var userId = _tenantService.GetCurrentUserId();
        var roles = _tenantService.GetCurrentRoles();
        var clinicIds = _tenantService.GetAuthorizedClinicIds();

        var email = User.Claims.FirstOrDefault(c => c.Type == "email")?.Value;
        var name = User.Claims.FirstOrDefault(c => c.Type == "name")?.Value;

        return Ok(new
        {
            userId,
            email,
            name,
            roles,
            clinicIds,
        });
    }

    /// <summary>
    /// Encerrar sessão do usuário, invalidando o token atual via blacklist.
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Logout()
    {
        // 1. Extract JTI from the current token's claims
        var jti = User.Claims.FirstOrDefault(c => c.Type == "jti")?.Value;
        if (string.IsNullOrEmpty(jti))
        {
            return NoContent(); // No JTI to blacklist
        }

        // 2. Calculate remaining time until token expiration from "exp" claim
        var expClaim = User.Claims.FirstOrDefault(c => c.Type == "exp")?.Value;
        if (expClaim is null || !long.TryParse(expClaim, out var expUnix))
        {
            return NoContent(); // Can't determine expiration
        }

        var expirationTime = DateTimeOffset.FromUnixTimeSeconds(expUnix);
        var remainingTtl = expirationTime - DateTimeOffset.UtcNow;

        if (remainingTtl <= TimeSpan.Zero)
        {
            return NoContent(); // Token already expired
        }

        // 3. Blacklist the token
        await _tokenBlacklistService.BlacklistTokenAsync(jti, remainingTtl);

        // 4. Return 204 No Content
        return NoContent();
    }
}
