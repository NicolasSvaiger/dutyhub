using System.Text.Json;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

/// <summary>
/// Handles batch synchronization of offline attendance events.
/// Processes each event individually and guarantees idempotency via (LocalEventId, UserId, DeviceId).
/// Uses Redis distributed lock to prevent race conditions during concurrent processing.
/// Uses Redis idempotency cache for fast duplicate detection before hitting the database.
/// Uses Redis rate limiting to prevent excessive sync requests per user/device.
/// </summary>
public class AttendanceSyncService : IAttendanceSyncService
{
    private readonly IAttendanceRepository _attendanceRepository;
    private readonly IOfflineAttendanceEventRepository _offlineEventRepository;
    private readonly IShiftRepository _shiftRepository;
    private readonly ITenantService _tenantService;
    private readonly IDistributedLockService _distributedLockService;
    private readonly IOfflineEventValidator _offlineEventValidator;
    private readonly IAntiFraudDetector _antiFraudDetector;
    private readonly IOfflineSyncAuditService _syncAuditService;

    /// <summary>
    /// TTL for the distributed lock during event processing (30 seconds).
    /// If processing takes longer, the lock auto-releases to prevent deadlocks.
    /// </summary>
    private static readonly TimeSpan LockTtl = TimeSpan.FromSeconds(30);

    /// <summary>
    /// TTL for the idempotency cache entry (10 minutes).
    /// Covers the window where a client might immediately re-send the same event.
    /// After expiry, the DB unique index still prevents duplicates.
    /// </summary>
    private static readonly TimeSpan IdempotencyTtl = TimeSpan.FromMinutes(10);

    /// <summary>
    /// Maximum number of sync requests allowed per user/device within the rate limit window.
    /// </summary>
    private const int RateLimitMaxRequests = 10;

    /// <summary>
    /// Time window for the sync rate limiter (5 minutes).
    /// A user/device can submit at most RateLimitMaxRequests sync requests within this window.
    /// </summary>
    private static readonly TimeSpan RateLimitWindow = TimeSpan.FromMinutes(5);

    public AttendanceSyncService(
        IAttendanceRepository attendanceRepository,
        IOfflineAttendanceEventRepository offlineEventRepository,
        IShiftRepository shiftRepository,
        ITenantService tenantService,
        IDistributedLockService distributedLockService,
        IOfflineEventValidator offlineEventValidator,
        IAntiFraudDetector antiFraudDetector,
        IOfflineSyncAuditService syncAuditService)
    {
        _attendanceRepository = attendanceRepository;
        _offlineEventRepository = offlineEventRepository;
        _shiftRepository = shiftRepository;
        _tenantService = tenantService;
        _distributedLockService = distributedLockService;
        _offlineEventValidator = offlineEventValidator;
        _antiFraudDetector = antiFraudDetector;
        _syncAuditService = syncAuditService;
    }

    public async Task<SyncResponse> SyncOfflineEventsAsync(OfflineEventSyncRequest request)
    {
        var userId = _tenantService.GetCurrentUserId()
            ?? throw new UnauthorizedException("User not authenticated.");

        // Rate limit: prevent excessive sync requests per user/device (Redis-backed, fail-open)
        var deviceId = request.Events.FirstOrDefault()?.DeviceId ?? "unknown";
        var isRateLimited = await _distributedLockService.IsRateLimitedAsync(
            userId, deviceId, RateLimitMaxRequests, RateLimitWindow);

        if (isRateLimited)
        {
            throw new RateLimitExceededException(
                $"Taxa de sincronização excedida. Máximo de {RateLimitMaxRequests} requisições por {RateLimitWindow.TotalMinutes} minutos por dispositivo.");
        }

        var response = new SyncResponse
        {
            TotalReceived = request.Events.Count
        };

        foreach (var eventItem in request.Events)
        {
            var result = await ProcessSingleEventAsync(eventItem, userId);
            response.Results.Add(result);

            // Log audit for every sync event processed
            await _syncAuditService.LogSyncEventAsync(
                eventItem,
                userId,
                result.Status,
                result.Status == SyncStatus.Rejected || result.Status == SyncStatus.RequiresReview
                    ? result.Message
                    : null);

            switch (result.Status)
            {
                case SyncStatus.OfflineSynced:
                case SyncStatus.OfflineSyncedLate:
                    response.Synced++;
                    break;
                case SyncStatus.DuplicateIgnored:
                    response.Duplicates++;
                    break;
                case SyncStatus.Rejected:
                    response.Rejected++;
                    break;
                case SyncStatus.RequiresReview:
                    response.RequiresReview++;
                    break;
            }
        }

        return response;
    }

    private async Task<SyncEventResult> ProcessSingleEventAsync(OfflineEventSyncItem eventItem, Guid userId)
    {
        // Build the idempotency key: LocalEventId + UserId + DeviceId
        var idempotencyKey = BuildIdempotencyKey(eventItem.LocalEventId, userId, eventItem.DeviceId);

        // 1. Fast check: Redis idempotency cache (short-TTL, catches immediate re-sends)
        var existsInCache = await _distributedLockService.ExistsIdempotencyKeyAsync(idempotencyKey);
        if (existsInCache)
        {
            return new SyncEventResult
            {
                LocalEventId = eventItem.LocalEventId,
                Status = SyncStatus.DuplicateIgnored,
                Message = "Evento já foi sincronizado anteriormente."
            };
        }

        // 2. Acquire distributed lock to prevent race conditions on concurrent submissions
        var lockKey = idempotencyKey;
        var lockAcquired = await _distributedLockService.TryAcquireLockAsync(lockKey, LockTtl);

        if (!lockAcquired)
        {
            // Another process is currently handling this same event — treat as duplicate
            return new SyncEventResult
            {
                LocalEventId = eventItem.LocalEventId,
                Status = SyncStatus.DuplicateIgnored,
                Message = "Evento está sendo processado por outra requisição."
            };
        }

        try
        {
            // 3. Definitive check: PostgreSQL (source of truth for idempotency)
            var isDuplicate = await _offlineEventRepository.ExistsAsync(
                eventItem.LocalEventId, userId, eventItem.DeviceId);

            if (isDuplicate)
            {
                // Set the idempotency cache so subsequent re-sends are caught faster
                await _distributedLockService.SetIdempotencyKeyAsync(idempotencyKey, IdempotencyTtl);

                return new SyncEventResult
                {
                    LocalEventId = eventItem.LocalEventId,
                    Status = SyncStatus.DuplicateIgnored,
                    Message = "Evento já foi sincronizado anteriormente."
                };
            }

            // Also check the Attendance table (backward compatibility with events synced before OfflineAttendanceEvent table)
            var existsInAttendance = await _attendanceRepository.ExistsByLocalEventIdAsync(
                eventItem.LocalEventId, userId, eventItem.DeviceId);

            if (existsInAttendance)
            {
                await _distributedLockService.SetIdempotencyKeyAsync(idempotencyKey, IdempotencyTtl);

                return new SyncEventResult
                {
                    LocalEventId = eventItem.LocalEventId,
                    Status = SyncStatus.DuplicateIgnored,
                    Message = "Evento já foi sincronizado anteriormente."
                };
            }

            // 4. Validate attendance type
            if (eventItem.AttendanceType != "CheckIn" && eventItem.AttendanceType != "CheckOut")
            {
                return new SyncEventResult
                {
                    LocalEventId = eventItem.LocalEventId,
                    Status = SyncStatus.Rejected,
                    Message = $"Tipo de evento inválido: '{eventItem.AttendanceType}'. Valores aceitos: 'CheckIn', 'CheckOut'."
                };
            }

            // 5. Run offline event validation (user-clinic, shift, temporal, geolocation, biometric, clock skew)
            var validationResult = await _offlineEventValidator.ValidateAsync(eventItem, userId);

            if (validationResult.IsRejected)
            {
                return new SyncEventResult
                {
                    LocalEventId = eventItem.LocalEventId,
                    Status = SyncStatus.Rejected,
                    Message = string.Join(" ", validationResult.Messages)
                };
            }

            // 5.5. Run anti-fraud detection (produces explicit flag codes)
            var antiFraudFlags = await _antiFraudDetector.DetectAsync(eventItem, userId);
            if (antiFraudFlags.Count > 0)
            {
                // Attach flags to validation result
                validationResult.AntiFraudFlags.AddRange(antiFraudFlags);

                // Any anti-fraud flag escalates to RequiresReview
                if (validationResult.Outcome != ValidationOutcome.Rejected)
                {
                    validationResult.Outcome = ValidationOutcome.RequiresReview;
                }

                // Add flag descriptions to messages
                foreach (var flag in antiFraudFlags)
                {
                    if (!validationResult.Messages.Contains(flag.Description))
                    {
                        validationResult.Messages.Add(flag.Description);
                    }
                }
            }

            // 6. Process based on attendance type
            SyncEventResult result;
            if (eventItem.AttendanceType == "CheckIn")
            {
                result = await ProcessCheckInAsync(eventItem, userId);
            }
            else
            {
                result = await ProcessCheckOutAsync(eventItem, userId);
            }

            // If validation flagged for review, override the result status
            if (validationResult.NeedsReview)
            {
                result.Status = SyncStatus.RequiresReview;
                result.Message = string.Join(" ", validationResult.Messages);
            }

            // 7. Save event to OfflineAttendanceEvent table (audit trail)
            await SaveOfflineEventAsync(eventItem, userId, result.Status, validationResult.AntiFraudFlags);

            // 8. Set idempotency cache after successful processing
            await _distributedLockService.SetIdempotencyKeyAsync(idempotencyKey, IdempotencyTtl);

            return result;
        }
        finally
        {
            // Always release the lock after processing
            await _distributedLockService.ReleaseLockAsync(lockKey);
        }
    }

    private async Task SaveOfflineEventAsync(OfflineEventSyncItem eventItem, Guid userId, SyncStatus syncStatus, List<AntiFraudFlag>? antiFraudFlags = null)
    {
        string? flagsJson = null;
        if (antiFraudFlags != null && antiFraudFlags.Count > 0)
        {
            var flagCodes = antiFraudFlags.Select(f => f.Code.ToString()).ToList();
            flagsJson = JsonSerializer.Serialize(flagCodes);
        }

        var offlineEvent = new OfflineAttendanceEvent
        {
            OfflineAttendanceEventId = Guid.NewGuid(),
            LocalEventId = eventItem.LocalEventId,
            UserId = userId,
            ClinicId = eventItem.ClinicId,
            ShiftId = eventItem.ShiftId,
            AttendanceType = eventItem.AttendanceType,
            LocalDateTime = eventItem.LocalDateTime,
            ReceivedAtServer = DateTime.UtcNow,
            Latitude = eventItem.Latitude,
            Longitude = eventItem.Longitude,
            DeviceId = eventItem.DeviceId,
            AppVersion = eventItem.AppVersion,
            BiometricValidated = eventItem.BiometricValidated,
            SyncStatus = syncStatus,
            IsDuplicate = false,
            RequiresReview = syncStatus == SyncStatus.RequiresReview,
            AntiFraudFlags = flagsJson,
            CreatedAt = DateTime.UtcNow
        };

        await _offlineEventRepository.AddAsync(offlineEvent);
    }

    private async Task<SyncEventResult> ProcessCheckInAsync(OfflineEventSyncItem eventItem, Guid userId)
    {
        var serverNow = DateTime.UtcNow;

        // Check for active check-in on this shift
        var hasActiveCheckIn = await _attendanceRepository.HasActiveCheckInAsync(userId, eventItem.ShiftId);
        if (hasActiveCheckIn)
        {
            return new SyncEventResult
            {
                LocalEventId = eventItem.LocalEventId,
                Status = SyncStatus.Rejected,
                Message = "Já existe um check-in ativo para este plantão."
            };
        }

        // Determine sync status based on time delay
        var syncStatus = DetermineSyncStatus(eventItem.LocalDateTime, serverNow);
        var requiresReview = syncStatus == SyncStatus.RequiresReview;

        var attendance = new Attendance
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ShiftId = eventItem.ShiftId,
            ClinicId = eventItem.ClinicId,
            CheckInTime = eventItem.LocalDateTime,
            CheckInLatitude = eventItem.Latitude,
            CheckInLongitude = eventItem.Longitude,
            CheckInDeviceId = eventItem.DeviceId,
            BiometricValidated = eventItem.BiometricValidated,
            LocalEventId = eventItem.LocalEventId,
            CheckInLocalDateTime = eventItem.LocalDateTime,
            CheckInServerDateTime = serverNow,
            SyncSource = SyncSource.Offline,
            SyncStatus = syncStatus,
            RequiresReview = requiresReview,
            ReviewReason = requiresReview ? "Evento offline com atraso significativo na sincronização." : null
        };

        await _attendanceRepository.AddAsync(attendance);

        return new SyncEventResult
        {
            LocalEventId = eventItem.LocalEventId,
            Status = syncStatus,
            Message = GetSyncStatusMessage(syncStatus),
            AttendanceId = attendance.Id
        };
    }

    private async Task<SyncEventResult> ProcessCheckOutAsync(OfflineEventSyncItem eventItem, Guid userId)
    {
        var serverNow = DateTime.UtcNow;

        // Find the active check-in for this shift
        var attendance = await _attendanceRepository.GetByUserAndShiftAsync(userId, eventItem.ShiftId);
        if (attendance is null || attendance.CheckOutTime is not null)
        {
            return new SyncEventResult
            {
                LocalEventId = eventItem.LocalEventId,
                Status = SyncStatus.Rejected,
                Message = "Não existe check-in ativo para este plantão."
            };
        }

        // Determine sync status
        var syncStatus = DetermineSyncStatus(eventItem.LocalDateTime, serverNow);
        var requiresReview = syncStatus == SyncStatus.RequiresReview;

        // Update the attendance with check-out info
        attendance.CheckOutTime = eventItem.LocalDateTime;
        attendance.CheckOutLatitude = eventItem.Latitude;
        attendance.CheckOutLongitude = eventItem.Longitude;
        attendance.CheckOutDeviceId = eventItem.DeviceId;
        attendance.CheckOutLocalDateTime = eventItem.LocalDateTime;
        attendance.CheckOutServerDateTime = serverNow;

        // If check-out sync has issues, flag for review
        if (requiresReview)
        {
            attendance.RequiresReview = true;
            attendance.ReviewReason = string.IsNullOrEmpty(attendance.ReviewReason)
                ? "Evento offline de check-out com atraso significativo na sincronização."
                : $"{attendance.ReviewReason}; Evento offline de check-out com atraso significativo na sincronização.";
        }

        // If the original check-in was online, mark that checkout was offline
        if (attendance.SyncSource == SyncSource.Online)
        {
            attendance.SyncSource = SyncSource.Offline;
        }

        if (syncStatus != SyncStatus.RequiresReview && attendance.SyncStatus == SyncStatus.OnlineSynced)
        {
            attendance.SyncStatus = SyncStatus.OfflineSynced;
        }
        else if (syncStatus == SyncStatus.RequiresReview)
        {
            attendance.SyncStatus = syncStatus;
        }

        await _attendanceRepository.UpdateAsync(attendance);

        return new SyncEventResult
        {
            LocalEventId = eventItem.LocalEventId,
            Status = syncStatus,
            Message = GetSyncStatusMessage(syncStatus),
            AttendanceId = attendance.Id
        };
    }

    /// <summary>
    /// Builds a composite idempotency key from the event's unique identifiers.
    /// Format: {LocalEventId}:{UserId}:{DeviceId}
    /// </summary>
    private static string BuildIdempotencyKey(Guid localEventId, Guid userId, string deviceId)
    {
        return $"{localEventId}:{userId}:{deviceId}";
    }

    /// <summary>
    /// Determines sync status based on delay between local event time and server receipt time.
    /// Events older than 24 hours are flagged for review.
    /// Events older than 1 hour are marked as synced late.
    /// </summary>
    private static SyncStatus DetermineSyncStatus(DateTime localDateTime, DateTime serverNow)
    {
        var delay = serverNow - localDateTime;

        if (delay.TotalHours > 24)
        {
            return SyncStatus.RequiresReview;
        }

        if (delay.TotalHours > 1)
        {
            return SyncStatus.OfflineSyncedLate;
        }

        return SyncStatus.OfflineSynced;
    }

    private static string GetSyncStatusMessage(SyncStatus status)
    {
        return status switch
        {
            SyncStatus.OfflineSynced => "Evento sincronizado com sucesso.",
            SyncStatus.OfflineSyncedLate => "Evento sincronizado com sucesso (atraso detectado).",
            SyncStatus.RequiresReview => "Evento sincronizado, porém requer revisão manual.",
            _ => "Evento processado."
        };
    }
}
