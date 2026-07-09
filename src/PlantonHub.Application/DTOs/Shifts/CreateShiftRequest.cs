namespace PlantonHub.Application.DTOs.Shifts;

public class CreateShiftRequest
{
    public Guid ClinicId { get; set; }
    public string Title { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
}
