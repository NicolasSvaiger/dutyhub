namespace PlantonHub.Application.DTOs.Biometric;

public class FaceEnrollmentResponse
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool HasPhoto { get; set; }
}
