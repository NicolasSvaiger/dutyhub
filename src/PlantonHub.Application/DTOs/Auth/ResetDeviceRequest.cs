namespace PlantonHub.Application.DTOs.Auth;

/// <summary>
/// Request to unlink/reset the active device for a user.
/// </summary>
public class ResetDeviceRequest
{
    /// <summary>
    /// Reason for the device reset (required for audit trail).
    /// Examples: "Troca de celular", "Celular roubado", "Dispositivo perdido"
    /// </summary>
    public string Reason { get; set; } = string.Empty;
}
