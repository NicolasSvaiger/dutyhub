using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IPublicOrganRepository
{
    Task<PublicOrgan?> GetByIdAsync(Guid id);
    Task<IEnumerable<PublicOrgan>> GetAllAsync();
    Task<IEnumerable<PublicOrgan>> GetRootsAsync();
    Task<IEnumerable<PublicOrgan>> GetChildrenAsync(Guid parentId);
    Task AddAsync(PublicOrgan organ);
    Task UpdateAsync(PublicOrgan organ);

    /// <summary>
    /// Retorna o organ raiz + todos os descendentes transitivos (children,
    /// grandchildren, ...). Usado pelo <c>PrefeituraService</c> para resolver
    /// o escopo de um gestor: gestor da raiz vê a árvore inteira, gestor
    /// de uma subprefeitura vê só ela.
    ///
    /// Implementação em memória (sem CTE recursivo) — o organograma real
    /// é raso (2-3 níveis, ~50 nós no pior caso) e o resultado é cacheado
    /// no Redis por 5 min via <c>CacheKeys.PrefeituraOrganScope</c>.
    /// Ver design.md § D3.
    /// </summary>
    Task<IEnumerable<Guid>> GetDescendantIdsAsync(Guid rootId, CancellationToken ct = default);
}
