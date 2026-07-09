namespace PlantonHub.Application.Interfaces;

public interface ITenantService
{
    Guid? GetCurrentClinicId();
    Guid? GetCurrentUserId();
    IEnumerable<string> GetCurrentRoles();
    bool IsAdminGlobal();
}
