namespace PlantonHub.Application.DTOs.Shifts;

public class ShiftResponse
{
    public Guid Id { get; set; }
    public Guid ClinicId { get; set; }
    public string Title { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<ShiftAssignmentResponse> Assignments { get; set; } = new();
}

public class ShiftAssignmentResponse
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string? UserName { get; set; }
    public DateTime AssignedAt { get; set; }
}
