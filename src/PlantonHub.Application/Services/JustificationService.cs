using PlantonHub.Application.DTOs.Justifications;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class JustificationService : IJustificationService
{
    private readonly IJustificationRepository _repo;
    private readonly IUserRepository _userRepo;
    private readonly ITenantService _tenant;

    public JustificationService(
        IJustificationRepository repo,
        IUserRepository userRepo,
        ITenantService tenant)
    {
        _repo = repo;
        _userRepo = userRepo;
        _tenant = tenant;
    }

    public async Task<IEnumerable<JustificationResponse>> GetAllAsync()
    {
        if (_tenant.IsAdminGlobal())
        {
            var all = await _repo.GetAllAsync();
            return all.Select(MapToResponse);
        }

        var authorized = _tenant.GetAuthorizedClinicIds().ToHashSet();
        if (authorized.Count == 0)
            return Enumerable.Empty<JustificationResponse>();

        var scoped = await _repo.GetByClinicIdsAsync(authorized);
        return scoped.Select(MapToResponse);
    }

    public async Task<JustificationResponse?> GetByIdAsync(Guid id)
    {
        var j = await _repo.GetByIdAsync(id);
        if (j is null) return null;

        if (!_tenant.IsAdminGlobal())
        {
            var authorized = _tenant.GetAuthorizedClinicIds().ToHashSet();
            if (!authorized.Contains(j.ClinicId)) return null;
        }

        return MapToResponse(j);
    }

    public async Task<JustificationResponse> CreateAsync(CreateJustificationRequest request)
    {
        EnsureCanManage(request.ClinicId);

        var absentUser = await _userRepo.GetByIdAsync(request.AbsentUserId)
            ?? throw new NotFoundException($"User with id '{request.AbsentUserId}' not found.");

        var protocol = string.IsNullOrWhiteSpace(request.ProtocolNumber)
            ? await GenerateProtocolAsync()
            : request.ProtocolNumber!.Trim();

        if (await _repo.ProtocolExistsAsync(protocol))
            throw new ConflictException($"O protocolo '{protocol}' já existe.");

        var now = DateTime.UtcNow;
        var j = new Justification
        {
            Id = Guid.NewGuid(),
            ProtocolNumber = protocol,
            ClinicId = request.ClinicId,
            AbsentUserId = absentUser.Id,
            ShiftDate = DateTime.SpecifyKind(request.ShiftDate.Date, DateTimeKind.Utc),
            ShiftTurn = request.ShiftTurn,
            RequestType = request.RequestType,
            RequestText = request.RequestText,
            DeadlineDate = DateTime.SpecifyKind(request.DeadlineDate.Date, DateTimeKind.Utc),
            Status = JustificationStatus.Pending,
            CreatedAt = now,
        };

        await _repo.AddAsync(j);
        var created = await _repo.GetByIdAsync(j.Id);
        return MapToResponse(created!);
    }

    public async Task<JustificationResponse> StartAnalysisAsync(Guid id)
    {
        var j = await _repo.GetByIdAsync(id)
            ?? throw new NotFoundException($"Justification with id '{id}' not found.");

        EnsureCanManage(j.ClinicId);

        if (j.Status is JustificationStatus.Approved or JustificationStatus.Rejected)
            throw new ConflictException("Justificativa já foi respondida.");

        j.Status = JustificationStatus.UnderAnalysis;
        await _repo.UpdateAsync(j);

        var updated = await _repo.GetByIdAsync(id);
        return MapToResponse(updated!);
    }

    public async Task<JustificationResponse> RespondAsync(Guid id, RespondJustificationRequest request)
    {
        var j = await _repo.GetByIdAsync(id)
            ?? throw new NotFoundException($"Justification with id '{id}' not found.");

        EnsureCanManage(j.ClinicId);

        if (j.Status is JustificationStatus.Approved or JustificationStatus.Rejected)
            throw new ConflictException("Justificativa já foi respondida.");

        j.Status = request.Approve ? JustificationStatus.Approved : JustificationStatus.Rejected;
        j.ResponseText = request.ResponseText;
        j.RespondedAt = DateTime.UtcNow;
        j.RespondedByUserId = _tenant.GetCurrentUserId();

        await _repo.UpdateAsync(j);

        var updated = await _repo.GetByIdAsync(id);
        return MapToResponse(updated!);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void EnsureCanManage(Guid clinicId)
    {
        var roles = _tenant.GetCurrentRoles();
        var isAdminGlobal = _tenant.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
            throw new ForbiddenException("Only AdminClinica or AdminGlobal can manage justifications.");

        if (isAdminClinica && !isAdminGlobal)
        {
            var authorized = _tenant.GetAuthorizedClinicIds().ToHashSet();
            if (!authorized.Contains(clinicId))
                throw new ForbiddenException("AdminClinica can only manage justifications for their own clinics.");
        }
    }

    private async Task<string> GenerateProtocolAsync()
    {
        var year = DateTime.UtcNow.Year;
        // Simple sequence-scan approach — good enough for low-throughput admin scenarios.
        // Format: JUS-YYYY-NNNN (4-digit sequence, resets per year).
        for (int attempt = 0; attempt < 20; attempt++)
        {
            var seq = Random.Shared.Next(1, 9999);
            var candidate = $"JUS-{year}-{seq:D4}";
            if (!await _repo.ProtocolExistsAsync(candidate))
                return candidate;
        }
        // Fallback with timestamp suffix (extremely unlikely to reach)
        return $"JUS-{year}-{DateTime.UtcNow.Ticks % 10000:D4}";
    }

    private static JustificationResponse MapToResponse(Justification j)
    {
        var today = DateTime.UtcNow.Date;
        var isResolved = j.Status is JustificationStatus.Approved or JustificationStatus.Rejected;

        return new JustificationResponse
        {
            Id = j.Id,
            ProtocolNumber = j.ProtocolNumber,
            ClinicId = j.ClinicId,
            ClinicName = j.Clinic?.Name ?? "—",
            AbsentUserId = j.AbsentUserId,
            AbsentUserName = j.AbsentUser?.Name ?? "—",
            AbsentUserRegistrationNumber = j.AbsentUser?.RegistrationNumber,
            ShiftDate = j.ShiftDate,
            ShiftTurn = j.ShiftTurn,
            RequestType = j.RequestType,
            RequestText = j.RequestText,
            DeadlineDate = j.DeadlineDate,
            Status = j.Status,
            ResponseText = j.ResponseText,
            RespondedAt = j.RespondedAt,
            RespondedByUserId = j.RespondedByUserId,
            RespondedByUserName = j.RespondedByUser?.Name,
            IsDeadlineOverdue = !isResolved && j.DeadlineDate.Date < today,
            DaysToDeadline = isResolved ? null : (int)Math.Round((j.DeadlineDate.Date - today).TotalDays),
            CreatedAt = j.CreatedAt,
        };
    }
}
