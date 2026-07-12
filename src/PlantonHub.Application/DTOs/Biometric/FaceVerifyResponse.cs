namespace PlantonHub.Application.DTOs.Biometric;

/// <summary>
/// Response from face verification endpoint.
/// </summary>
public class FaceVerifyResponse
{
    public bool IsMatch { get; set; }
    public double Confidence { get; set; }
}
