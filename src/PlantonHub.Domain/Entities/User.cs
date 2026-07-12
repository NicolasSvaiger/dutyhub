namespace PlantonHub.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    public ICollection<UserClinicRole> UserClinicRoles { get; set; } = new List<UserClinicRole>();
    public ICollection<ShiftAssignment> ShiftAssignments { get; set; } = new List<ShiftAssignment>();
    public ICollection<Attendance> Attendances { get; set; } = new List<Attendance>();
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
    public ICollection<FaceEnrollment> FaceEnrollments { get; set; } = new List<FaceEnrollment>();
    public ICollection<DeviceRegistration> DeviceRegistrations { get; set; } = new List<DeviceRegistration>();
    public ICollection<DeviceUnlinkAudit> DeviceUnlinkAudits { get; set; } = new List<DeviceUnlinkAudit>();
}
