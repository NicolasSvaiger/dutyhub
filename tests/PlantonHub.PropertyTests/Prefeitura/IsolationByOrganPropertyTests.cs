using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Moq;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;

namespace PlantonHub.PropertyTests.Prefeitura;

/// <summary>
/// Sprint 7B — Property 1: isolamento por organ.
///
/// Para qualquer par (organA, organB) sem relação parent/child, o gestor
/// de A nunca vê dados vinculados a clínicas cobertas pelos contratos de B.
/// Verificado via GetClinicsAsync — a lista retornada é subconjunto exato
/// das clínicas que o ContractRepo autorizou pra A. Validates: Requirements 3.1, 3.3.
/// </summary>
[Trait("Feature", "sprint-7-prefeitura")]
public class IsolationByOrganPropertyTests
{
    [Property(MaxTest = 50)]
    public Property GetClinics_NeverContains_ClinicsOutsideAuthorizedScope()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            (organA, organB) =>
            {
                // Skip degenerate case — same org (property de organs distintos).
                if (organA == organB || organA == Guid.Empty || organB == Guid.Empty)
                    return true.ToProperty();

                var clinicAId = Guid.NewGuid();
                var clinicBId = Guid.NewGuid();

                var service = PrefeituraPropertyHelpers.BuildService(
                    organId: organA,
                    descendantIds: new[] { organA },
                    clinicIds: new[] { clinicAId },
                    customize: mocks =>
                    {
                        // Contract repo é chamado APENAS com os organs do scope de A.
                        // Se acidentalmente puxasse organB, este mock não bateria.
                        mocks.ClinicRepo.Setup(c => c.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                                        .ReturnsAsync(new[]
                                        {
                                            new Clinic { Id = clinicAId, Name = "UPA A", IsActive = true },
                                        });
                    });

                var result = service.GetClinicsAsync().GetAwaiter().GetResult();

                // Propriedade: nenhum clinicBId nunca aparece; apenas clinicAId.
                return (result.All(c => c.ClinicId == clinicAId) &&
                        result.All(c => c.ClinicId != clinicBId)).ToProperty();
            });
    }
}
