namespace PlantonHub.Application.DTOs.Auth;

public class DeviceUnlinkAuditResponse
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string OldDeviceId { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string? DeviceModel { get; set; }
    public string UnlinkedBy { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public DateTime UnlinkedAt { get; set; }
}
