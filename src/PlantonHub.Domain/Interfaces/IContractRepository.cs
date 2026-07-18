using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IContractRepository
{
    Task<Contract?> GetByIdAsync(Guid id);
    Task<IEnumerable<Contract>> GetAllAsync();

    /// <summary>Returns all contracts that contain at least one of the given clinic ids.</summary>
    Task<IEnumerable<Contract>> GetByClinicIdsAsync(IEnumerable<Guid> clinicIds);

    /// <summary>
    /// Retorna os ids únicos das clínicas cobertas por contratos com status
    /// <see cref="Enums.ContractStatus.Active"/> vinculados a qualquer um
    /// dos <paramref name="organIds"/> fornecidos.
    ///
    /// Usado pelo <c>PrefeituraService</c> como segundo passo do scope
    /// resolution: dado o escopo hierárquico (organ + descendentes), lista
    /// as UPAs onde o gestor deve enxergar dados. Contratos em
    /// <c>Renewal</c> ou <c>Inactive</c> são intencionalmente excluídos
    /// para evitar mostrar dados de UPAs fora do vínculo vigente.
    /// </summary>
    Task<IEnumerable<Guid>> GetActiveClinicIdsByOrganIdsAsync(
        IEnumerable<Guid> organIds,
        CancellationToken ct = default);

    Task AddAsync(Contract contract);
    Task UpdateAsync(Contract contract);
}
