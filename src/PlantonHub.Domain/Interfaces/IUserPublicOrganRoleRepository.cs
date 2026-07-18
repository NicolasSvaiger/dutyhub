using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

/// <summary>
/// Read/write acesso à junção usuário ↔ orgão público. As leituras
/// dominam o uso — o <c>TenantMiddleware</c> chama <see cref="GetByUserIdAsync"/>
/// como fallback quando o JWT do Cognito não trouxe o claim <c>publicOrganId</c>
/// (Lambda offline ou usuário legado). Escrita rodam apenas em fluxos
/// administrativos (Sprint 7B/7C ou via seed).
/// </summary>
public interface IUserPublicOrganRoleRepository
{
    /// <summary>
    /// Retorna todos os roles do usuário sobre orgãos públicos. Um mesmo usuário
    /// pode gerenciar múltiplos organs (secretário municipal de duas cidades),
    /// mas o token normalmente só carrega o primeiro — a UI de troca de organ
    /// ativo fica para uma sprint futura (débito documentado em design.md § R4).
    /// </summary>
    Task<IEnumerable<UserPublicOrganRole>> GetByUserIdAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Retorna todos os gestores vinculados a um orgão. Usado por telas de
    /// administração (listar gestores de uma prefeitura) e por auditoria.
    /// </summary>
    Task<IEnumerable<UserPublicOrganRole>> GetByOrganIdAsync(Guid publicOrganId, CancellationToken ct = default);

    Task AddAsync(UserPublicOrganRole role, CancellationToken ct = default);

    Task RemoveAsync(UserPublicOrganRole role, CancellationToken ct = default);
}
