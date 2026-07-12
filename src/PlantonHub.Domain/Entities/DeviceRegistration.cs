namespace PlantonHub.Domain.Entities;

/// <summary>
/// Tracks the single active device (smartphone) allowed for each user.
/// Only one device can be active at a time — login from a different device is blocked.
/// </summary>
public class DeviceRegistration
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    /// <summary>
    /// Unique device identifier (android_id or identifierForVendor on iOS).
    /// </summary>
    public string DeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Platform: "android" or "ios".
    /// </summary>
    public string Platform { get; set; } = string.Empty;

    /// <summary>
    /// Device model for admin visibility (e.g. "Samsung Galaxy S24", "iPhone 15 Pro").
    /// </summary>
    public string? DeviceModel { get; set; }

    /// <summary>
    /// Whether this registration is currently active.
    /// Only one active registration per user at a time.
    /// </summary>
    public bool IsActive { get; set; } = true;

    public DateTime RegisteredAt { get; set; }

    // Navigation
    public User User { get; set; } = null!;
}
