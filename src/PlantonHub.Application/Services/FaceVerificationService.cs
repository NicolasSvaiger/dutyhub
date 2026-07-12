using Microsoft.Extensions.Options;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class FaceVerificationService : IFaceVerificationService
{
    private readonly IFaceEnrollmentRepository _enrollmentRepository;
    private readonly double _matchThreshold;

    public FaceVerificationService(
        IFaceEnrollmentRepository enrollmentRepository,
        IOptions<AntiFraudSettings> antiFraudSettings)
    {
        _enrollmentRepository = enrollmentRepository;
        _matchThreshold = antiFraudSettings.Value.FaceMatchThreshold;
    }

    public async Task<FaceVerificationResult> VerifyAsync(Guid userId, float[] probeEmbedding)
    {
        if (probeEmbedding.Length == 0)
        {
            return new FaceVerificationResult(false, 0, null);
        }

        var enrollments = await _enrollmentRepository.GetActiveByUserIdAsync(userId);

        double bestScore = 0;
        Guid? bestMatchId = null;

        foreach (var enrollment in enrollments)
        {
            if (enrollment.Embedding.Length != probeEmbedding.Length)
                continue;

            var similarity = CosineSimilarity(probeEmbedding, enrollment.Embedding);

            if (similarity > bestScore)
            {
                bestScore = similarity;
                bestMatchId = enrollment.Id;
            }
        }

        var isMatch = bestScore >= _matchThreshold;

        return new FaceVerificationResult(isMatch, bestScore, isMatch ? bestMatchId : null);
    }

    /// <summary>
    /// Computes cosine similarity between two vectors.
    /// Returns value between -1 and 1, where 1 = identical.
    /// For normalized FaceNet embeddings, typical match threshold is 0.6-0.7.
    /// </summary>
    public static double CosineSimilarity(float[] a, float[] b)
    {
        if (a.Length != b.Length || a.Length == 0)
            return 0;

        double dotProduct = 0;
        double normA = 0;
        double normB = 0;

        for (int i = 0; i < a.Length; i++)
        {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        var denominator = Math.Sqrt(normA) * Math.Sqrt(normB);

        if (denominator == 0)
            return 0;

        return dotProduct / denominator;
    }
}
