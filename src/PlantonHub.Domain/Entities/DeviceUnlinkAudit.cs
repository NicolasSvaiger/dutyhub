namespace PlantonHub.Domain.Entities;

/// <summary>
/// Audit log for device unlink events.
/// Records who unlinked, when, and why — for compliance and fraud investigation.
/// </summary>
public class DeviceUnlinkAudit
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    /// <summary>
    /// The device ID that was unlinked.
    /// </summary>
    public string OldDeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Platform of the unlinked device.
    /// </summary>
    public string Platform { get; set; } = string.Empty;

    /// <summary>
    /// Model of the unlinked device.
    /// </summary>
    public string? DeviceModel { get; set; }

    /// <summary>
    /// Who performed the unlink: "self" (profissional) or "admin:{adminUserId}".
    /// </summary>
    public string UnlinkedBy { get; set; } = string.Empty;

    /// <summary>
    /// Reason for the unlink.
    /// </summary>
    public string Reason { get; set; } = string.Empty;

    public DateTime UnlinkedAt { get; set; }

    // Navigation
    public User User { get; set; } = null!;
}
