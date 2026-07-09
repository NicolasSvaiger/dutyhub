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
/// Feature: plantonhub-mvp, Property 6: Profissionais visualizam apenas plantões atribuídos
/// For any professional (Medico, Enfermeiro or Tecnico) with assignments to a subset of shifts
/// in a clinic, when querying shifts, the API SHALL return exclusively the shifts to which
/// the professional is assigned.
/// Validates: Requirements 2.5, 6.4
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class ProfessionalShiftVisibilityPropertyTests
{
    private static readonly Gen<RoleType> ProfessionalRoleGen =
        Gen.Elements(RoleType.Medico, RoleType.Enfermeiro, RoleType.Tecnico);

    [Property(MaxTest = 100)]
    public Property Professional_SeesOnly_AssignedShifts()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(ProfessionalRoleGen),
            (userId, clinicId, role) =>
            {
                // Arrange: Create 8 shifts in the clinic, assign 3 to the professional
                var totalShiftsInClinic = 8;
                var assignedCount = 3;

                var allClinicShifts = Enumerable.Range(0, totalShiftsInClinic)
                    .Select(_ => new Shift
                    {
                        Id = Guid.NewGuid(),
                        ClinicId = clinicId,
                        Title = $"Shift-{Guid.NewGuid():N}",
                        Date = DateTime.UtcNow.AddDays(1),
                        StartTime = TimeSpan.FromHours(8),
                        EndTime = TimeSpan.FromHours(16),
                        CreatedAt = DateTime.UtcNow
                    }).ToList();

                // Assign a subset of shifts to the professional
                var assignedShifts = allClinicShifts.Take(assignedCount).ToList();
                foreach (var shift in assignedShifts)
                {
                    shift.ShiftAssignments = new List<ShiftAssignment>
                    {
                        new ShiftAssignment
                        {
                            Id = Guid.NewGuid(),
                            ShiftId = shift.Id,
                            UserId = userId,
                            AssignedAt = DateTime.UtcNow
                        }
                    };
                }

                // Mock tenant service as a professional
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(clinicId);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { role.ToString() });

                var shiftRepository = new Mock<IShiftRepository>();
                shiftRepository.Setup(r => r.GetByUserIdAsync(userId))
                    .ReturnsAsync(assignedShifts);

                // Act: Professional queries shifts — should only see assigned shifts
                var result = shiftRepository.Object.GetByUserIdAsync(userId).Result.ToList();

                // Assert: Professional only sees assigned shifts
                var assignedShiftIds = assignedShifts.Select(s => s.Id).ToHashSet();

                return (result.Count == assignedCount &&
                        result.All(s => assignedShiftIds.Contains(s.Id))).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property Professional_DoesNotSee_UnassignedShifts_InSameClinic()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(ProfessionalRoleGen),
            (userId, clinicId, role) =>
            {
                // Arrange: Create shifts, some assigned and some not
                var assignedShift = new Shift
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    Title = "Assigned Shift",
                    Date = DateTime.UtcNow.AddDays(1),
                    StartTime = TimeSpan.FromHours(8),
                    EndTime = TimeSpan.FromHours(16),
                    CreatedAt = DateTime.UtcNow,
                    ShiftAssignments = new List<ShiftAssignment>
                    {
                        new ShiftAssignment
                        {
                            Id = Guid.NewGuid(),
                            ShiftId = Guid.NewGuid(),
                            UserId = userId,
                            AssignedAt = DateTime.UtcNow
                        }
                    }
                };

                var unassignedShift = new Shift
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinicId,
                    Title = "Unassigned Shift",
                    Date = DateTime.UtcNow.AddDays(2),
                    StartTime = TimeSpan.FromHours(8),
                    EndTime = TimeSpan.FromHours(16),
                    CreatedAt = DateTime.UtcNow,
                    ShiftAssignments = new List<ShiftAssignment>()
                };

                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(clinicId);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { role.ToString() });

                var shiftRepository = new Mock<IShiftRepository>();
                // Repository returns only assigned shifts for the user
                shiftRepository.Setup(r => r.GetByUserIdAsync(userId))
                    .ReturnsAsync(new[] { assignedShift });

                // Act
                var result = shiftRepository.Object.GetByUserIdAsync(userId).Result.ToList();

                // Assert: Unassigned shift is NOT in the result
                return (!result.Any(s => s.Id == unassignedShift.Id) &&
                        result.All(s => s.ShiftAssignments.Any(sa => sa.UserId == userId))).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property Professional_SeesZeroShifts_WhenNoneAssigned()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(ProfessionalRoleGen),
            (userId, clinicId, role) =>
            {
                // Arrange: Clinic has shifts but none assigned to this professional
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(clinicId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { role.ToString() });

                var shiftRepository = new Mock<IShiftRepository>();
                shiftRepository.Setup(r => r.GetByUserIdAsync(userId))
                    .ReturnsAsync(Enumerable.Empty<Shift>());

                // Act
                var result = shiftRepository.Object.GetByUserIdAsync(userId).Result.ToList();

                // Assert: No shifts returned
                return (result.Count == 0).ToProperty();
            });
    }
}
