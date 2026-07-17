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

    /// <summary>
    /// Confirms the current caller is allowed to operate on the target user.
    /// AdminGlobal → always true.
    /// Otherwise → true only when the target user has at least one clinic
    /// in common with the caller's authorized clinics.
    /// Returns false when the target user doesn't exist.
    ///
    /// Prevents IDOR on admin endpoints that accept a {userId} route parameter
    /// (biometric enroll, device reset, device audit, setup-face-login, etc.).
    /// </summary>
    Task<bool> CanOperateOnUserAsync(Guid targetUserId);
}
