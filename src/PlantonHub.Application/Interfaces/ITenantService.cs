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
    /// PublicOrgan id do gestor logado, resolvido pelo <c>TenantMiddleware</c>
    /// a partir do claim <c>publicOrganId</c> do JWT (fast path) ou do
    /// fallback DB via <see cref="Domain.Interfaces.IUserPublicOrganRoleRepository"/>.
    /// Retorna null quando o usuário não é <c>GestorPublico</c> ou quando
    /// nenhum organ foi resolvido. Sync — o async foi feito upstream no
    /// middleware, mesmo padrão de <see cref="GetCurrentUserId"/>.
    /// </summary>
    Guid? GetCurrentPublicOrganId();

    /// <summary>
    /// Autoriza acesso a um <see cref="Domain.Entities.PublicOrgan"/> específico.
    /// AdminGlobal → sempre true.
    /// GestorPublico → true quando o organ solicitado é o próprio ou um
    /// descendente na hierarquia parent/child (implementado no PrefeituraService).
    /// Retorna false em qualquer outro caso.
    ///
    /// Usado como guarda em endpoints administrativos que aceitam
    /// <c>{publicOrganId}</c> na rota. Sprint 7A expõe apenas a assinatura;
    /// a lógica de descendentes chega na Sprint 7B junto com o repositório.
    /// </summary>
    Task<bool> CanAccessPublicOrganAsync(Guid publicOrganId);

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
