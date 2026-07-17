using PlantonHub.Application.DTOs.Alerts;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class AlertService : IAlertService
{
    private readonly IAlertRepository _repo;
    private readonly ITenantService _tenant;

    public AlertService(IAlertRepository repo, ITenantService tenant)
    {
        _repo = repo;
        _tenant = tenant;
    }

    public async Task<IEnumerable<AlertResponse>> GetAllAsync()
    {
        var alerts = await LoadScopedAsync();
        return alerts.Select(MapToResponse);
    }

    public async Task<AlertResponse?> GetByIdAsync(Guid id)
    {
        var alert = await _repo.GetByIdAsync(id);
        if (alert is null) return null;

        if (!_tenant.IsAdminGlobal())
        {
            var authorized = _tenant.GetAuthorizedClinicIds().ToHashSet();
            var isVisible = !alert.ClinicId.HasValue || authorized.Contains(alert.ClinicId.Value);
            if (!isVisible) return null;
        }

        return MapToResponse(alert);
    }

    public async Task<AlertsSummaryResponse> GetSummaryAsync()
    {
        var alerts = (await LoadScopedAsync()).ToList();
        var todayStart = DateTime.UtcNow.Date;

        return new AlertsSummaryResponse
        {
            TotalAll = alerts.Count,
            TotalToday = alerts.Count(a => a.CreatedAt >= todayStart),
            OpenCritical = alerts.Count(a => !a.IsResolved && a.Level == AlertLevel.Critical),
            OpenWarning = alerts.Count(a => !a.IsResolved && a.Level == AlertLevel.Warning),
            OpenInfo = alerts.Count(a => !a.IsResolved && a.Level == AlertLevel.Info),
            ResolvedToday = alerts.Count(a => a.IsResolved && a.ResolvedAt.HasValue && a.ResolvedAt.Value >= todayStart),
        };
    }

    public async Task<AlertResponse> CreateAsync(CreateAlertRequest request)
    {
        EnsureCanManage(request.ClinicId);

        var code = string.IsNullOrWhiteSpace(request.Code)
            ? await GenerateCodeAsync()
            : request.Code!.Trim();

        if (await _repo.CodeExistsAsync(code))
            throw new ConflictException($"O código '{code}' já existe.");

        var alert = new Alert
        {
            Id = Guid.NewGuid(),
            Code = code,
            Level = request.Level,
            Type = request.Type,
            Title = request.Title,
            Description = request.Description,
            ClinicId = request.ClinicId,
            RelatedUserId = request.RelatedUserId,
            PrimaryActionLabel = request.PrimaryActionLabel,
            SecondaryActionLabel = request.SecondaryActionLabel,
            IsResolved = false,
            CreatedAt = DateTime.UtcNow,
        };

        await _repo.AddAsync(alert);
        var created = await _repo.GetByIdAsync(alert.Id);
        return MapToResponse(created!);
    }

    public async Task<AlertResponse> ResolveAsync(Guid id, ResolveAlertRequest? request = null)
    {
        var alert = await _repo.GetByIdAsync(id)
            ?? throw new NotFoundException($"Alert with id '{id}' not found.");

        EnsureCanManage(alert.ClinicId);

        if (alert.IsResolved)
            return MapToResponse(alert);

        alert.IsResolved = true;
        alert.Level = AlertLevel.Resolved;
        alert.ResolvedAt = DateTime.UtcNow;
        alert.ResolvedByUserId = _tenant.GetCurrentUserId();
        alert.ResolutionNotes = request?.ResolutionNotes;

        await _repo.UpdateAsync(alert);

        var updated = await _repo.GetByIdAsync(id);
        return MapToResponse(updated!);
    }

    public async Task<int> ResolveAllAsync()
    {
        EnsureCanManageAny();

        var isAdminGlobal = _tenant.IsAdminGlobal();
        var authorized = isAdminGlobal ? null : (IEnumerable<Guid>)_tenant.GetAuthorizedClinicIds().ToList();
        return await _repo.ResolveAllAsync(
            authorized,
            _tenant.GetCurrentUserId(),
            DateTime.UtcNow,
            globalScope: isAdminGlobal);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<IEnumerable<Alert>> LoadScopedAsync()
    {
        if (_tenant.IsAdminGlobal())
            return await _repo.GetAllAsync();

        var authorized = _tenant.GetAuthorizedClinicIds().ToList();
        if (authorized.Count == 0)
            return Enumerable.Empty<Alert>();

        return await _repo.GetByClinicIdsAsync(authorized, includeGlobal: true);
    }

    private void EnsureCanManage(Guid? clinicId)
    {
        var roles = _tenant.GetCurrentRoles();
        var isAdminGlobal = _tenant.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
            throw new ForbiddenException("Only AdminClinica or AdminGlobal can manage alerts.");

        if (isAdminClinica && !isAdminGlobal && clinicId.HasValue)
        {
            var authorized = _tenant.GetAuthorizedClinicIds().ToHashSet();
            if (!authorized.Contains(clinicId.Value))
                throw new ForbiddenException("AdminClinica can only manage alerts for their own clinics.");
        }
    }

    private void EnsureCanManageAny()
    {
        var roles = _tenant.GetCurrentRoles();
        var isAdminGlobal = _tenant.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);
        if (!isAdminGlobal && !isAdminClinica)
            throw new ForbiddenException("Only AdminClinica or AdminGlobal can manage alerts.");
    }

    private async Task<string> GenerateCodeAsync()
    {
        var year = DateTime.UtcNow.Year;
        for (int attempt = 0; attempt < 20; attempt++)
        {
            var seq = Random.Shared.Next(1, 9999);
            var candidate = $"ALT-{year}-{seq:D4}";
            if (!await _repo.CodeExistsAsync(candidate))
                return candidate;
        }
        return $"ALT-{year}-{DateTime.UtcNow.Ticks % 10000:D4}";
    }

    private static AlertResponse MapToResponse(Alert a) => new()
    {
        Id = a.Id,
        Code = a.Code,
        Level = a.Level,
        Type = a.Type,
        Title = a.Title,
        Description = a.Description,
        ClinicId = a.ClinicId,
        ClinicName = a.Clinic?.Name,
        RelatedUserId = a.RelatedUserId,
        RelatedUserName = a.RelatedUser?.Name,
        PrimaryActionLabel = a.PrimaryActionLabel,
        SecondaryActionLabel = a.SecondaryActionLabel,
        IsResolved = a.IsResolved,
        ResolvedAt = a.ResolvedAt,
        ResolvedByUserId = a.ResolvedByUserId,
        ResolvedByUserName = a.ResolvedByUser?.Name,
        ResolutionNotes = a.ResolutionNotes,
        CreatedAt = a.CreatedAt,
    };
}
