namespace PlantonHub.Application.DTOs.Auth;

/// <summary>
/// Login request using email + face verification.
/// The email identifies the user, the embedding proves identity.
/// </summary>
public class FaceLoginRequest
{
    /// <summary>
    /// User's email address (registered in Cognito).
    /// </summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// 128-dimensional facial embedding from the live selfie.
    /// </summary>
    public float[] Embedding { get; set; } = Array.Empty<float>();

    /// <summary>
    /// Unique device identifier (android_id or identifierForVendor).
    /// </summary>
    public string DeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Platform: "android" or "ios".
    /// </summary>
    public string Platform { get; set; } = string.Empty;

    /// <summary>
    /// Device model name for admin visibility.
    /// </summary>
    public string? DeviceModel { get; set; }
}
