using Microsoft.AspNetCore.Http;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Infrastructure.Services;

/// <summary>
/// Logs audit records for each offline sync event, capturing full metadata:
/// user identity, device info, IP, UserAgent, geolocation, timing, and validation result.
/// </summary>
public class OfflineSyncAuditService : IOfflineSyncAuditService
{
    private readonly IOfflineSyncAuditLogRepository _repository;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public OfflineSyncAuditService(
        IOfflineSyncAuditLogRepository repository,
        IHttpContextAccessor httpContextAccessor)
    {
        _repository = repository;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task LogSyncEventAsync(
        OfflineEventSyncItem eventItem,
        Guid userId,
        SyncStatus syncStatus,
        string? rejectionOrReviewReason = null)
    {
        var httpContext = _httpContextAccessor.HttpContext;

        var ipAddress = httpContext?.Connection.RemoteIpAddress?.ToString();
        var userAgent = httpContext?.Request.Headers.UserAgent.ToString();

        var validationResult = MapSyncStatusToAuditResult(syncStatus);

        var auditLog = new OfflineSyncAuditLog
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ClinicId = eventItem.ClinicId,
            ShiftId = eventItem.ShiftId,
            LocalEventId = eventItem.LocalEventId,
            LocalDateTime = eventItem.LocalDateTime,
            ReceivedAtServer = DateTime.UtcNow,
            DeviceId = eventItem.DeviceId,
            IpAddress = ipAddress,
            UserAgent = userAgent,
            Latitude = eventItem.Latitude,
            Longitude = eventItem.Longitude,
            ValidationResult = validationResult,
            RejectionOrReviewReason = rejectionOrReviewReason,
            CreatedAt = DateTime.UtcNow
        };

        await _repository.AddAsync(auditLog);
    }

    /// <summary>
    /// Maps a SyncStatus to the corresponding SyncAuditResult for the audit log.
    /// </summary>
    private static SyncAuditResult MapSyncStatusToAuditResult(SyncStatus syncStatus)
    {
        return syncStatus switch
        {
            SyncStatus.OfflineSynced => SyncAuditResult.Accepted,
            SyncStatus.OfflineSyncedLate => SyncAuditResult.Accepted,
            SyncStatus.RequiresReview => SyncAuditResult.RequiresReview,
            SyncStatus.Rejected => SyncAuditResult.Rejected,
            SyncStatus.DuplicateIgnored => SyncAuditResult.Accepted,
            _ => SyncAuditResult.Accepted
        };
    }
}
