namespace PlantonHub.Application.DTOs.Attendance;

public class CheckOutRequest
{
    public Guid ShiftId { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string DeviceId { get; set; } = string.Empty;
}
