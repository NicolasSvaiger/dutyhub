using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Metadata;
using PlantonHub.Domain.Entities;

namespace PlantonHub.Infrastructure.Data;

/// <summary>
/// Captures Create/Update/Delete on business-critical entities and writes an
/// <see cref="AuditLog"/> row in the same transaction as the tracked change.
///
/// Chosen as the single audit mechanism because:
///   • DRY — one class covers every service that touches an audited entity.
///   • KISS — uses EF Core's native interceptor infrastructure. No plumbing.
///   • YAGNI — no MediatR, no Decorator, no event bus.
///   • Testable in isolation via <c>DbContextOptionsBuilder.AddInterceptors</c>.
///
/// Login/Logout events are not entity mutations and are handled separately
/// via <c>IAuditService.LogAsync</c> when we add explicit logging (not in this
/// sprint). This is the same audit service — not a second mechanism.
///
/// Events without an <c>HttpContext</c> (seeder, background jobs) are
/// intentionally skipped: they are system-level and there is no user to blame.
/// </summary>
public class AuditSaveChangesInterceptor : SaveChangesInterceptor
{
    // Entities that should generate an audit row on every CUD.
    // Keeping this explicit — YAGNI over "audit everything" — because most
    // high-write tables (Attendance, OfflineAttendanceEvent, OfflineSyncAuditLog,
    // AuditLog itself) already have their own audit trail or would swamp the
    // audit table with noise.
    private static readonly HashSet<Type> AuditedTypes = new()
    {
        typeof(User),
        typeof(UserClinicRole),
        typeof(Clinic),
        typeof(ClinicShiftTemplate),
        typeof(Contract),
        typeof(PublicOrgan),
        typeof(SystemSettings),
        typeof(Substitution),
        typeof(Justification),
        typeof(Alert),
        typeof(FaceEnrollment),
        typeof(DeviceRegistration),
    };

    // Module label per entity type (used to power the AdminAuditoria filter).
    private static readonly Dictionary<Type, string> Modules = new()
    {
        [typeof(User)] = "Usuários",
        [typeof(UserClinicRole)] = "Permissões",
        [typeof(Clinic)] = "UPAs",
        [typeof(ClinicShiftTemplate)] = "UPAs",
        [typeof(Contract)] = "Contratos",
        [typeof(PublicOrgan)] = "Órgãos Públicos",
        [typeof(SystemSettings)] = "Configurações",
        [typeof(Substitution)] = "Substituições",
        [typeof(Justification)] = "Justificativas",
        [typeof(Alert)] = "Alertas",
        [typeof(FaceEnrollment)] = "Biometria",
        [typeof(DeviceRegistration)] = "Dispositivos",
    };

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly IHttpContextAccessor _httpContextAccessor;

    public AuditSaveChangesInterceptor(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        var context = eventData.Context;
        if (context is null) return ValueTask.FromResult(result);

        AddAuditEntries(context);
        return ValueTask.FromResult(result);
    }

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        var context = eventData.Context;
        if (context is null) return result;

        AddAuditEntries(context);
        return result;
    }

    private void AddAuditEntries(DbContext context)
    {
        var http = _httpContextAccessor.HttpContext;
        if (http is null)
        {
            // No user context (seeder, background job). Nothing to attribute.
            return;
        }

        var userId = ResolveCurrentUserId(http);
        if (userId is null)
        {
            // Unauthenticated caller — no audit subject.
            return;
        }

        var ipAddress = http.Connection.RemoteIpAddress?.ToString();
        var timestamp = DateTime.UtcNow;

        // Snapshot the entries before we call AddRange (which mutates the change tracker).
        var pendingEntries = context.ChangeTracker
            .Entries()
            .Where(e => AuditedTypes.Contains(e.Entity.GetType()) &&
                        e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .Select(e => BuildAuditLog(e, userId.Value, ipAddress, timestamp))
            .ToList();

        if (pendingEntries.Count > 0)
        {
            context.Set<AuditLog>().AddRange(pendingEntries);
        }
    }

    private static AuditLog BuildAuditLog(EntityEntry entry, Guid userId, string? ipAddress, DateTime timestamp)
    {
        var entityType = entry.Entity.GetType();
        var operation = entry.State switch
        {
            EntityState.Added => "Create",
            EntityState.Modified => "Update",
            EntityState.Deleted => "Delete",
            _ => "Unknown",
        };

        var before = entry.State == EntityState.Added ? null : SerializeSide(entry, useOriginal: true);
        var after = entry.State == EntityState.Deleted ? null : SerializeSide(entry, useOriginal: false);

        return new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Timestamp = timestamp,
            Operation = operation,
            Entity = entityType.Name,
            EntityId = ResolveEntityId(entry),
            Module = Modules.TryGetValue(entityType, out var module) ? module : null,
            IpAddress = Truncate(ipAddress, 64),
            BeforeValue = Truncate(before, 1000),
            AfterValue = Truncate(after, 1000),
            Details = null,
        };
    }

    private static string ResolveEntityId(EntityEntry entry)
    {
        var key = entry.Metadata.FindPrimaryKey();
        if (key is null) return string.Empty;

        var values = key.Properties
            .Select(p => entry.Property(p.Name).CurrentValue?.ToString() ?? "")
            .ToArray();

        return string.Join('|', values);
    }

    /// <summary>
    /// Serialize scalar properties only (skips navigations to avoid cycles and
    /// bloated payloads). Uses <c>OriginalValue</c> for BEFORE and <c>CurrentValue</c>
    /// for AFTER — matches the semantics stakeholders expect on the audit UI.
    /// </summary>
    private static string? SerializeSide(EntityEntry entry, bool useOriginal)
    {
        var dict = new Dictionary<string, object?>();
        foreach (IProperty prop in entry.Metadata.GetProperties())
        {
            // Skip huge or sensitive columns to keep the audit row small and safe.
            if (IsSkippedProperty(prop.Name)) continue;

            var propEntry = entry.Property(prop.Name);
            var value = useOriginal ? propEntry.OriginalValue : propEntry.CurrentValue;
            dict[prop.Name] = value;
        }
        return dict.Count == 0 ? null : JsonSerializer.Serialize(dict, JsonOpts);
    }

    private static bool IsSkippedProperty(string propertyName) => propertyName switch
    {
        // Never leak password hashes or embeddings into the audit trail.
        "PasswordHash" => true,
        "Embedding" => true,
        _ => false,
    };

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrEmpty(value)) return value;
        return value.Length <= max ? value : value.Substring(0, max);
    }

    private static Guid? ResolveCurrentUserId(HttpContext http)
    {
        // Prefer the value already resolved by TenantMiddleware (set in HttpContext.Items)
        // to avoid a second parse of the JWT.
        if (http.Items.TryGetValue("CurrentUserId", out var stored) && stored is Guid storedGuid)
        {
            return storedGuid;
        }

        var sub = http.User?.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value
               ?? http.User?.FindFirst("sub")?.Value;

        return Guid.TryParse(sub, out var parsed) ? parsed : (Guid?)null;
    }
}
