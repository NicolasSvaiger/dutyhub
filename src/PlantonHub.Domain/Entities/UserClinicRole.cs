using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

public class UserClinicRole
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ClinicId { get; set; }
    public RoleType Role { get; set; }
    public DateTime AssignedAt { get; set; }

    // Navigation properties
    public User User { get; set; } = null!;
    public Clinic Clinic { get; set; } = null!;
}
