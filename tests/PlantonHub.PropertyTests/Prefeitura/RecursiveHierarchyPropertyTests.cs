using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Moq;
using PlantonHub.Domain.Entities;

namespace PlantonHub.PropertyTests.Prefeitura;

/// <summary>
/// Sprint 7B — Property 2: hierarquia recursiva.
///
/// Gestor de organ raiz vê a união dos dados de root + descendentes
/// transitivos. A regra é aplicada pelo <c>ResolveScopeAsync</c> que
/// consulta <c>IPublicOrganRepository.GetDescendantIdsAsync</c> e passa
/// esses ids todos ao <c>IContractRepository</c>. Property confirma que
/// (a) o repositório recebeu a lista completa de descendentes e (b) o
/// resultado do endpoint reflete tudo o que estava autorizado.
/// Validates: Requirements 3.2, 1.9.
/// </summary>
[Trait("Feature", "sprint-7-prefeitura")]
public class RecursiveHierarchyPropertyTests
{
    // Gera 1..5 descendentes pra cada organ raiz.
    private static readonly Gen<int> DescendantCount = Gen.Choose(1, 5);

    [Property(MaxTest = 30)]
    public Property GestorRoot_ScopeIncludesAllTransitiveDescendants()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From(DescendantCount),
            (rootId, descendantsCount) =>
            {
                if (rootId == Guid.Empty) return true.ToProperty();

                var descendantIds = Enumerable.Range(0, descendantsCount)
                    .Select(_ => Guid.NewGuid()).ToList();
                var fullScope = new[] { rootId }.Concat(descendantIds).ToList();

                // Cada organ do scope tem exatamente uma clínica.
                var clinicIds = fullScope.Select(_ => Guid.NewGuid()).ToList();
                var clinicsByOrgan = fullScope.Zip(clinicIds, (o, c) => (o, c)).ToList();

                IEnumerable<Guid>? seenByContractRepo = null;

                var service = PrefeituraPropertyHelpers.BuildService(
                    organId: rootId,
                    descendantIds: fullScope,
                    clinicIds: clinicIds,
                    customize: mocks =>
                    {
                        // Captura o parâmetro pra afirmar que o service passou o scope
                        // completo (organ + descendentes) ao ContractRepository.
                        mocks.ContractRepo.Setup(r => r.GetActiveClinicIdsByOrganIdsAsync(
                                It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()))
                            .Callback<IEnumerable<Guid>, CancellationToken>((ids, _) => seenByContractRepo = ids.ToList())
                            .ReturnsAsync(clinicIds);
                        mocks.ClinicRepo.Setup(c => c.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                                        .ReturnsAsync(clinicIds.Select(id =>
                                            new Clinic { Id = id, Name = "UPA", IsActive = true }).ToList());
                    });

                var result = service.GetClinicsAsync().GetAwaiter().GetResult();

                // Property 1: o contract repo recebeu TODOS os organs do scope.
                var contractRepoSaw = seenByContractRepo!.ToHashSet();
                var expected = fullScope.ToHashSet();
                var receivedAll = expected.All(contractRepoSaw.Contains);

                // Property 2: o resultado retornado reflete todas as clínicas ativas.
                var returnedClinicIds = result.Select(c => c.ClinicId).ToHashSet();
                var expectedClinicIds = clinicIds.ToHashSet();

                return (receivedAll && returnedClinicIds.SetEquals(expectedClinicIds)).ToProperty();
            });
    }
}
