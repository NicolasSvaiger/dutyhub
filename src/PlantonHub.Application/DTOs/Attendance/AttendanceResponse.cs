namespace PlantonHub.Application.DTOs.Attendance;

public class AttendanceResponse
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ShiftId { get; set; }
    public Guid ClinicId { get; set; }
    public DateTime CheckInTime { get; set; }
    public double CheckInLatitude { get; set; }
    public double CheckInLongitude { get; set; }
    public string CheckInDeviceId { get; set; } = string.Empty;
    public bool BiometricValidated { get; set; }
    public DateTime? CheckOutTime { get; set; }
    public double? CheckOutLatitude { get; set; }
    public double? CheckOutLongitude { get; set; }
    public string? CheckOutDeviceId { get; set; }
}
