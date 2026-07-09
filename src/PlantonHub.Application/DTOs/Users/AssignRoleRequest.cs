using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Users;

public class AssignRoleRequest
{
    public Guid ClinicId { get; set; }
    public RoleType Role { get; set; }
}
