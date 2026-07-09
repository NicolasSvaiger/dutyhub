using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

public class Attendance
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

    // Offline sync fields
    public Guid? LocalEventId { get; set; }
    public DateTime? CheckInLocalDateTime { get; set; }
    public DateTime? CheckInServerDateTime { get; set; }
    public DateTime? CheckOutLocalDateTime { get; set; }
    public DateTime? CheckOutServerDateTime { get; set; }
    public SyncSource SyncSource { get; set; } = SyncSource.Online;
    public SyncStatus SyncStatus { get; set; } = SyncStatus.OnlineSynced;
    public bool RequiresReview { get; set; } = false;
    public string? ReviewReason { get; set; }

    // Navigation properties
    public User User { get; set; } = null!;
    public Shift Shift { get; set; } = null!;
    public Clinic Clinic { get; set; } = null!;
}
