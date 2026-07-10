namespace PlantonHub.Application.Interfaces;

public interface ITenantService
{
    Guid? GetCurrentClinicId();
    Guid? GetCurrentUserId();
    IEnumerable<string> GetCurrentRoles();
    bool IsAdminGlobal();

    /// <summary>
    /// All clinic ids the current user is authorized to operate on
    /// (extracted from the 'clinicIds' JWT claim, plus the legacy 'clinicId').
    /// </summary>
    IEnumerable<Guid> GetAuthorizedClinicIds();
}
