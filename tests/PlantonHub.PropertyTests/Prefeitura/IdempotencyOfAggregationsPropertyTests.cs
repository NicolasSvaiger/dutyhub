using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Moq;
using PlantonHub.Domain.Entities;

namespace PlantonHub.PropertyTests.Prefeitura;

/// <summary>
/// Sprint 7B — Property 3: idempotência de agregações.
///
/// Para as mesmas entradas (organId, from, to), duas chamadas consecutivas
/// a <c>GetKpisAsync</c> retornam DTOs com os mesmos totais. Detecta
/// bugs de acúmulo/mutação entre chamadas (ex.: state estático em lugar
/// errado, cache com invalidação parcial etc.).
/// Validates: Requirements 2.1, 2.2, 2.5.
/// </summary>
[Trait("Feature", "sprint-7-prefeitura")]
public class IdempotencyOfAggregationsPropertyTests
{
    [Property(MaxTest = 30)]
    public Property GetKpis_TwoConsecutiveCalls_ReturnEqualTotals()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From(Gen.Choose(1, 30)), // n dias de janela
            (organId, days) =>
            {
                if (organId == Guid.Empty) return true.ToProperty();

                var clinicId = Guid.NewGuid();
                var userId = Guid.NewGuid();
                var today = DateTime.UtcNow.Date;
                var from = DateTime.SpecifyKind(today.AddDays(-days), DateTimeKind.Utc);
                var to = DateTime.SpecifyKind(today, DateTimeKind.Utc);

                var shift = new Shift
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    Clinic = new Clinic { Id = clinicId, Name = "UPA", IsActive = true },
                    Title = "T",
                    Date = today.AddDays(-1),
                    StartTime = new TimeSpan(7, 0, 0),
                    EndTime = new TimeSpan(19, 0, 0),
                    CreatedAt = DateTime.UtcNow,
                    ShiftAssignments = new List<ShiftAssignment>
                    {
                        new()
                        {
                            Id = Guid.NewGuid(), UserId = userId,
                            User = new User { Id = userId, Name = "Dr X", Email = "x@x", PasswordHash = "h" },
                            AssignedAt = DateTime.UtcNow,
                        },
                    },
                    Attendances = new List<PlantonHub.Domain.Entities.Attendance>
                    {
                        new()
                        {
                            Id = Guid.NewGuid(), UserId = userId, ClinicId = clinicId,
                            CheckInTime = DateTime.SpecifyKind(today.AddDays(-1).Add(new TimeSpan(7, 5, 0)), DateTimeKind.Utc),
                            CheckInDeviceId = "d",
                        },
                    },
                };

                var service = PrefeituraPropertyHelpers.BuildService(
                    organId: organId,
                    descendantIds: new[] { organId },
                    clinicIds: new[] { clinicId },
                    customize: mocks =>
                    {
                        mocks.ShiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(
                                It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                            .ReturnsAsync(new[] { shift });
                        mocks.SubstitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                                              .ReturnsAsync(Array.Empty<Substitution>());
                    });

                var first = service.GetKpisAsync(from, to).GetAwaiter().GetResult();
                var second = service.GetKpisAsync(from, to).GetAwaiter().GetResult();

                return (first.TotalExpectedShifts == second.TotalExpectedShifts &&
                        first.TotalCoveredShifts == second.TotalCoveredShifts &&
                        first.TotalAbsences == second.TotalAbsences &&
                        first.TotalLateEvents == second.TotalLateEvents &&
                        first.GlobalComplianceRate == second.GlobalComplianceRate &&
                        first.ByClinic.Count == second.ByClinic.Count).ToProperty();
            });
    }
}
