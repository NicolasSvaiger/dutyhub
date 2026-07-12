namespace PlantonHub.Application.DTOs.Biometric;

/// <summary>
/// Response from face verification endpoint.
/// </summary>
public class FaceVerifyResponse
{
    public bool IsMatch { get; set; }
    public double Confidence { get; set; }

    /// <summary>
    /// Short-lived proof token issued when verification succeeds.
    /// Must be sent in the check-in request to prove biometric verification was performed server-side.
    /// Null if verification failed.
    /// </summary>
    public string? BiometricProofToken { get; set; }
}
