using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IAlertRepository
{
    Task<Alert?> GetByIdAsync(Guid id);
    Task<IEnumerable<Alert>> GetAllAsync();

    /// <summary>Retorna alertas de clínicas na lista + alertas globais (ClinicId null).</summary>
    Task<IEnumerable<Alert>> GetByClinicIdsAsync(IEnumerable<Guid> clinicIds, bool includeGlobal = true);

    Task<bool> CodeExistsAsync(string code);
    Task AddAsync(Alert alert);
    Task UpdateAsync(Alert alert);

    /// <summary>Marca todos os alertas abertos das clínicas como resolvidos e retorna a qtde afetada.</summary>
    Task<int> ResolveAllAsync(IEnumerable<Guid>? clinicIds, Guid? resolvedByUserId, DateTime resolvedAt, bool globalScope);
}
