namespace PlantonHub.Application.Interfaces;

public interface IFaceVerificationService
{
    /// <summary>
    /// Compares a probe embedding against all enrolled embeddings for a user.
    /// Returns true if any enrollment matches above the configured threshold.
    /// </summary>
    Task<FaceVerificationResult> VerifyAsync(Guid userId, float[] probeEmbedding);
}

public record FaceVerificationResult(
    bool IsMatch,
    double Confidence,
    Guid? MatchedEnrollmentId
);
