namespace PlantonHub.Application.DTOs.Biometric;

/// <summary>
/// Request to verify a face embedding against enrolled embeddings.
/// Used during check-in to confirm the person's identity.
/// </summary>
public class FaceVerifyRequest
{
    /// <summary>
    /// 128-dimensional facial embedding from the live selfie taken at check-in.
    /// </summary>
    public float[] Embedding { get; set; } = Array.Empty<float>();
}
