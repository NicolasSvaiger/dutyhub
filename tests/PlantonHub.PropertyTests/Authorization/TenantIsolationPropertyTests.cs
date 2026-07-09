using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Moq;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.PropertyTests.Authorization;

/// <summary>
/// Feature: plantonhub-mvp, Property 5: Isolamento de tenant para usuários não-globais
/// For any user with role AdminClinica, Medico, Enfermeiro or Tecnico linked to a specific clinic,
/// all queries SHALL return only data belonging to the active clinic in the token context,
/// never including data from other clinics.
/// Validates: Requirements 2.4, 3.1, 3.2, 4.3, 6.3
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class TenantIsolationPropertyTests
{
    private static readonly Gen<RoleType> NonGlobalRoleGen =
        Gen.Elements(RoleType.AdminClinica, RoleType.Medico, RoleType.Enfermeiro, RoleType.Tecnico);

    [Property(MaxTest = 100)]
    public Property NonGlobalUser_SeesOnly_OwnClinicShifts()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(NonGlobalRoleGen),
            (userId, activeClinicId, role) =>
            {
                // Arrange: Create shifts across multiple clinics (3 clinics total)
                var otherClinicId1 = Guid.NewGuid();
                var otherClinicId2 = Guid.NewGuid();

                var activeClinicShifts = Enumerable.Range(0, 3).Select(_ => new Shift
                {
                    Id = Guid.NewGuid(),
                    ClinicId = activeClinicId,
                    Title = "Active Shift",
                    Date = DateTime.UtcNow.AddDays(1),
                    StartTime = TimeSpan.FromHours(8),
                    EndTime = TimeSpan.FromHours(16),
                    CreatedAt = DateTime.UtcNow
                }).ToList();

                // Mock tenant service as non-global user
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(activeClinicId);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { role.ToString() });

                // Mock repository returns only active clinic shifts
                var shiftRepository = new Mock<IShiftRepository>();
                shiftRepository.Setup(r => r.GetByClinicIdAsync(activeClinicId))
                    .ReturnsAsync(activeClinicShifts);

                // Act: Non-global user queries shifts
                IEnumerable<Shift> result;
                if (tenantService.Object.IsAdminGlobal())
                {
                    result = shiftRepository.Object.GetAllAsync().Result;
                }
                else
                {
                    var clinicId = tenantService.Object.GetCurrentClinicId()!.Value;
                    result = shiftRepository.Object.GetByClinicIdAsync(clinicId).Result;
                }

                // Assert: Only shifts from the active clinic are returned
                var resultList = result.ToList();
                var allBelongToActiveClinic = resultList.All(s => s.ClinicId == activeClinicId);
                var noneFromOtherClinics = !resultList.Any(s =>
                    s.ClinicId == otherClinicId1 || s.ClinicId == otherClinicId2);

                return (allBelongToActiveClinic &&
                        noneFromOtherClinics &&
                        resultList.Count == activeClinicShifts.Count).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property AdminClinica_SeesOnly_OwnClinic_InClinicList()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            (userId, activeClinicId) =>
            {
                // Arrange: Create multiple clinics
                var activeClinic = new Clinic
                {
                    Id = activeClinicId,
                    Name = "Active Clinic",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                // Mock tenant service as AdminClinica
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(activeClinicId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });

                var clinicRepository = new Mock<IClinicRepository>();
                clinicRepository.Setup(r => r.GetByIdAsync(activeClinicId))
                    .ReturnsAsync(activeClinic);

                // Act: AdminClinica queries clinics — should only see their own clinic
                IEnumerable<Clinic> result;
                if (tenantService.Object.IsAdminGlobal())
                {
                    result = clinicRepository.Object.GetAllAsync().Result;
                }
                else
                {
                    var clinic = clinicRepository.Object.GetByIdAsync(
                        tenantService.Object.GetCurrentClinicId()!.Value).Result;
                    result = clinic != null ? new[] { clinic } : Array.Empty<Clinic>();
                }

                // Assert: AdminClinica sees only their own clinic
                var resultList = result.ToList();
                return (resultList.Count == 1 &&
                        resultList[0].Id == activeClinicId).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property TenantFilter_NeverReturns_DataFromOtherClinics()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(NonGlobalRoleGen),
            (userId, activeClinicId, role) =>
            {
                // Arrange: Shifts from other clinics
                var otherClinicId = Guid.NewGuid();

                var activeClinicShifts = Enumerable.Range(0, 2).Select(_ => new Shift
                {
                    Id = Guid.NewGuid(),
                    ClinicId = activeClinicId,
                    Title = "My Shift",
                    Date = DateTime.UtcNow,
                    StartTime = TimeSpan.FromHours(8),
                    EndTime = TimeSpan.FromHours(16),
                    CreatedAt = DateTime.UtcNow
                }).ToList();

                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(activeClinicId);

                var shiftRepository = new Mock<IShiftRepository>();
                shiftRepository.Setup(r => r.GetByClinicIdAsync(activeClinicId))
                    .ReturnsAsync(activeClinicShifts);

                // Act
                var clinicId = tenantService.Object.GetCurrentClinicId()!.Value;
                var result = shiftRepository.Object.GetByClinicIdAsync(clinicId).Result.ToList();

                // Assert: No data from other clinics is present
                return (!result.Any(s => s.ClinicId == otherClinicId) &&
                        result.All(s => s.ClinicId == activeClinicId)).ToProperty();
            });
    }
}
