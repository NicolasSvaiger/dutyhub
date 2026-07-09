namespace PlantonHub.Domain.Entities;

public class ShiftAssignment
{
    public Guid Id { get; set; }
    public Guid ShiftId { get; set; }
    public Guid UserId { get; set; }
    public DateTime AssignedAt { get; set; }

    // Navigation properties
    public Shift Shift { get; set; } = null!;
    public User User { get; set; } = null!;
}
