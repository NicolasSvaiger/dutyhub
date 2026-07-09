namespace PlantonHub.Application.Interfaces;

public interface ICacheService
{
    /// <summary>
    /// Busca valor do cache ou executa factory e armazena resultado.
    /// </summary>
    Task<T?> GetOrSetAsync<T>(string key, Func<Task<T>> factory, TimeSpan? ttl = null, CancellationToken ct = default);

    /// <summary>
    /// Busca valor do cache. Retorna null se não encontrado.
    /// </summary>
    Task<T?> GetAsync<T>(string key, CancellationToken ct = default);

    /// <summary>
    /// Armazena valor no cache com TTL.
    /// </summary>
    Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default);

    /// <summary>
    /// Remove uma entrada do cache (invalidação).
    /// </summary>
    Task RemoveAsync(string key, CancellationToken ct = default);

    /// <summary>
    /// Remove todas as entradas que correspondem a um padrão de chave.
    /// </summary>
    Task RemoveByPrefixAsync(string prefix, CancellationToken ct = default);
}
