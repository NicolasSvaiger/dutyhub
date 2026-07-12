using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PlantonHub.Application.DTOs.Biometric;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class BiometricController : ControllerBase
{
    private readonly IFaceEnrollmentRepository _enrollmentRepository;
    private readonly IFaceVerificationService _verificationService;
    private readonly ITenantService _tenantService;
    private readonly IBiometricProofService _biometricProofService;

    public BiometricController(
        IFaceEnrollmentRepository enrollmentRepository,
        IFaceVerificationService verificationService,
        ITenantService tenantService,
        IBiometricProofService biometricProofService)
    {
        _enrollmentRepository = enrollmentRepository;
        _verificationService = verificationService;
        _tenantService = tenantService;
        _biometricProofService = biometricProofService;
    }

    /// <summary>
    /// Enroll a face embedding for a user. Admin operation.
    /// The embedding is generated client-side (Flutter app) using FaceNet/MobileFaceNet.
    /// </summary>
    [HttpPost("enroll/{userId:guid}")]
    [Authorize(Policy = "AdminClinica")]
    [ProducesResponseType(typeof(FaceEnrollmentResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Enroll(Guid userId, [FromBody] FaceEnrollmentRequest request)
    {
        if (request.Embedding.Length == 0)
        {
            return BadRequest(new { message = "Embedding is required." });
        }

        if (request.Embedding.Length != 128)
        {
            return BadRequest(new { message = "Embedding must be 128-dimensional (FaceNet standard)." });
        }

        var enrollment = new FaceEnrollment
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Embedding = request.Embedding,
            PhotoUrl = null, // TODO: Store photo if provided
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        await _enrollmentRepository.AddAsync(enrollment);

        var response = new FaceEnrollmentResponse
        {
            Id = enrollment.Id,
            UserId = enrollment.UserId,
            IsActive = enrollment.IsActive,
            CreatedAt = enrollment.CreatedAt,
            HasPhoto = request.PhotoBase64 is not null,
        };

        return Created($"/api/biometric/enroll/{userId}", response);
    }

    /// <summary>
    /// Self-enroll: the authenticated professional enrolls their own face.
    /// Used in the Flutter app during initial setup.
    /// </summary>
    [HttpPost("enroll/me")]
    [Authorize(Policy = "Profissional")]
    [ProducesResponseType(typeof(FaceEnrollmentResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> EnrollSelf([FromBody] FaceEnrollmentRequest request)
    {
        var userId = _tenantService.GetCurrentUserId();
        if (userId is null) return Unauthorized();

        if (request.Embedding.Length != 128)
        {
            return BadRequest(new { message = "Embedding must be 128-dimensional." });
        }

        var enrollment = new FaceEnrollment
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            Embedding = request.Embedding,
            PhotoUrl = null,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        await _enrollmentRepository.AddAsync(enrollment);

        return Created($"/api/biometric/enroll/me", new FaceEnrollmentResponse
        {
            Id = enrollment.Id,
            UserId = enrollment.UserId,
            IsActive = true,
            CreatedAt = enrollment.CreatedAt,
            HasPhoto = request.PhotoBase64 is not null,
        });
    }

    /// <summary>
    /// Verify a face embedding against enrolled embeddings for the current user.
    /// Used during check-in to confirm identity.
    /// Returns match confidence — the Flutter app decides whether to proceed.
    /// </summary>
    [HttpPost("verify")]
    [Authorize(Policy = "Profissional")]
    [ProducesResponseType(typeof(FaceVerifyResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Verify([FromBody] FaceVerifyRequest request)
    {
        var userId = _tenantService.GetCurrentUserId();
        if (userId is null) return Unauthorized();

        if (request.Embedding.Length != 128)
        {
            return BadRequest(new { message = "Embedding must be 128-dimensional." });
        }

        var hasEnrollment = await _enrollmentRepository.HasEnrollmentAsync(userId.Value);
        if (!hasEnrollment)
        {
            return NotFound(new { message = "No face enrollment found. Please enroll first." });
        }

        var result = await _verificationService.VerifyAsync(userId.Value, request.Embedding);

        // Issue a single-use proof token if verification succeeded
        string? proofToken = null;
        if (result.IsMatch)
        {
            proofToken = await _biometricProofService.IssueTokenAsync(userId.Value);
        }

        return Ok(new FaceVerifyResponse
        {
            IsMatch = result.IsMatch,
            Confidence = result.Confidence,
            BiometricProofToken = proofToken,
        });
    }

    /// <summary>
    /// Check if the current user has an active face enrollment.
    /// Used by Flutter app to determine if enrollment step is needed.
    /// </summary>
    [HttpGet("status")]
    [Authorize(Policy = "Profissional")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetStatus()
    {
        var userId = _tenantService.GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var hasEnrollment = await _enrollmentRepository.HasEnrollmentAsync(userId.Value);

        return Ok(new { enrolled = hasEnrollment });
    }

    /// <summary>
    /// Re-enroll: deactivate all existing enrollments and create a fresh one.
    /// Used when a professional's appearance changes significantly.
    /// </summary>
    [HttpPost("re-enroll/{userId:guid}")]
    [Authorize(Policy = "AdminClinica")]
    [ProducesResponseType(typeof(FaceEnrollmentResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ReEnroll(Guid userId, [FromBody] FaceEnrollmentRequest request)
    {
        if (request.Embedding.Length != 128)
        {
            return BadRequest(new { message = "Embedding must be 128-dimensional." });
        }

        // Deactivate all previous enrollments
        await _enrollmentRepository.DeactivateAllForUserAsync(userId);

        var enrollment = new FaceEnrollment
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Embedding = request.Embedding,
            PhotoUrl = null,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        await _enrollmentRepository.AddAsync(enrollment);

        return Created($"/api/biometric/enroll/{userId}", new FaceEnrollmentResponse
        {
            Id = enrollment.Id,
            UserId = enrollment.UserId,
            IsActive = true,
            CreatedAt = enrollment.CreatedAt,
            HasPhoto = request.PhotoBase64 is not null,
        });
    }

    /// <summary>
    /// Delete own face enrollment (LGPD — direito de exclusão de dados biométricos).
    /// Deactivates all active enrollments for the current user.
    /// </summary>
    [HttpDelete("enroll/me")]
    [Authorize(Policy = "Profissional")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> DeleteOwnEnrollment()
    {
        var userId = _tenantService.GetCurrentUserId();
        if (userId is null) return Unauthorized();

        await _enrollmentRepository.DeactivateAllForUserAsync(userId.Value);

        return NoContent();
    }

    /// <summary>
    /// List all enrollments for a user (active and inactive). Admin operation for audit.
    /// </summary>
    [HttpGet("enrollments/{userId:guid}")]
    [Authorize(Policy = "AdminClinica")]
    [ProducesResponseType(typeof(IEnumerable<FaceEnrollmentResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetEnrollments(Guid userId)
    {
        var enrollments = await _enrollmentRepository.GetAllByUserIdAsync(userId);

        var response = enrollments.Select(e => new FaceEnrollmentResponse
        {
            Id = e.Id,
            UserId = e.UserId,
            IsActive = e.IsActive,
            CreatedAt = e.CreatedAt,
            HasPhoto = e.PhotoUrl is not null,
        });

        return Ok(response);
    }
}
