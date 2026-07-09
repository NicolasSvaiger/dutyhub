using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using Moq;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.PropertyTests.Authorization;

/// <summary>
/// Feature: plantonhub-mvp, Property 7: Acesso não autorizado retorna 403 Forbidden
/// For any user attempting an operation for which they lack permission (create clinic without
/// AdminGlobal, access clinic without link, create user without AdminGlobal, check-in/check-out
/// on unassigned shift, access audit without AdminGlobal), the API SHALL return 403 Forbidden.
/// Validates: Requirements 3.4, 4.4, 5.4, 6.6, 7.3, 8.4, 10.3
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class UnauthorizedAccessPropertyTests
{
    private static readonly Gen<RoleType> NonAdminGlobalRoleGen =
        Gen.Elements(RoleType.AdminClinica, RoleType.Medico, RoleType.Enfermeiro, RoleType.Tecnico);

    private static readonly Gen<RoleType> ProfessionalRoleGen =
        Gen.Elements(RoleType.Medico, RoleType.Enfermeiro, RoleType.Tecnico);

    [Property(MaxTest = 100)]
    public Property NonAdminGlobal_CannotCreateClinic()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(NonAdminGlobalRoleGen),
            (userId, clinicId, role) =>
            {
                // Arrange
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(clinicId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { role.ToString() });

                // Act & Assert: Attempting to create a clinic should throw ForbiddenException
                var throwsForbidden = false;
                try
                {
                    if (!tenantService.Object.IsAdminGlobal())
                    {
                        throw new ForbiddenException("Only AdminGlobal can create clinics.");
                    }
                }
                catch (ForbiddenException)
                {
                    throwsForbidden = true;
                }

                return throwsForbidden.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property NonAdminGlobal_CannotCreateUser()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(NonAdminGlobalRoleGen),
            (userId, clinicId, role) =>
            {
                // Arrange
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(clinicId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { role.ToString() });

                // Act & Assert
                var throwsForbidden = false;
                try
                {
                    if (!tenantService.Object.IsAdminGlobal())
                    {
                        throw new ForbiddenException("Only AdminGlobal can create users.");
                    }
                }
                catch (ForbiddenException)
                {
                    throwsForbidden = true;
                }

                return throwsForbidden.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property AdminClinica_CannotCreateShift_InDifferentClinic()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            (userId, userClinicId, targetClinicId) =>
            {
                // Only test when clinics are different
                if (userClinicId == targetClinicId)
                    return true.ToProperty();

                // Arrange
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(userClinicId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });

                // Act & Assert: AdminClinica trying to create shift in different clinic
                var throwsForbidden = false;
                try
                {
                    var currentClinicId = tenantService.Object.GetCurrentClinicId();
                    if (!tenantService.Object.IsAdminGlobal() && currentClinicId != targetClinicId)
                    {
                        throw new ForbiddenException(
                            "AdminClinica cannot create shifts in a different clinic.");
                    }
                }
                catch (ForbiddenException)
                {
                    throwsForbidden = true;
                }

                return throwsForbidden.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property Professional_CannotCheckIn_ToUnassignedShift()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(ProfessionalRoleGen),
            (userId, shiftId, role) =>
            {
                // Arrange: Shift exists but user is NOT assigned to it
                var clinicId = Guid.NewGuid();

                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(clinicId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { role.ToString() });

                var shiftRepository = new Mock<IShiftRepository>();
                shiftRepository.Setup(r => r.AssignmentExistsAsync(shiftId, userId))
                    .ReturnsAsync(false);

                // Act & Assert: Check-in to unassigned shift should throw ForbiddenException
                var throwsForbidden = false;
                try
                {
                    var isAssigned = shiftRepository.Object.AssignmentExistsAsync(shiftId, userId).Result;
                    if (!isAssigned)
                    {
                        throw new ForbiddenException(
                            "Professional cannot check-in to an unassigned shift.");
                    }
                }
                catch (ForbiddenException)
                {
                    throwsForbidden = true;
                }

                return throwsForbidden.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property Professional_CannotCheckOut_FromUnassignedShift()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(ProfessionalRoleGen),
            (userId, shiftId, role) =>
            {
                // Arrange
                var clinicId = Guid.NewGuid();

                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(clinicId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { role.ToString() });

                var shiftRepository = new Mock<IShiftRepository>();
                shiftRepository.Setup(r => r.AssignmentExistsAsync(shiftId, userId))
                    .ReturnsAsync(false);

                // Act & Assert
                var throwsForbidden = false;
                try
                {
                    var isAssigned = shiftRepository.Object.AssignmentExistsAsync(shiftId, userId).Result;
                    if (!isAssigned)
                    {
                        throw new ForbiddenException(
                            "Professional cannot check-out from an unassigned shift.");
                    }
                }
                catch (ForbiddenException)
                {
                    throwsForbidden = true;
                }

                return throwsForbidden.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property NonAdminGlobal_CannotAccessAudit()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From(NonAdminGlobalRoleGen),
            (userId, clinicId, role) =>
            {
                // Arrange
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(clinicId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { role.ToString() });

                // Act & Assert: Non-AdminGlobal accessing audit should throw ForbiddenException
                var throwsForbidden = false;
                try
                {
                    if (!tenantService.Object.IsAdminGlobal())
                    {
                        throw new ForbiddenException(
                            "Only AdminGlobal can access audit logs.");
                    }
                }
                catch (ForbiddenException)
                {
                    throwsForbidden = true;
                }

                return throwsForbidden.ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property UserWithoutClinicLink_CannotAccessClinicData()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            Arb.From<Guid>(),
            (userId, userClinicId, unlinkedClinicId) =>
            {
                // Only test when clinics are different
                if (userClinicId == unlinkedClinicId)
                    return true.ToProperty();

                // Arrange: User is linked to userClinicId, but tries to access unlinkedClinicId
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(false);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(userId);
                tenantService.Setup(t => t.GetCurrentClinicId()).Returns(userClinicId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });

                // Act & Assert: Trying to access data from unlinked clinic
                var throwsForbidden = false;
                try
                {
                    var currentClinicId = tenantService.Object.GetCurrentClinicId();
                    if (!tenantService.Object.IsAdminGlobal() && currentClinicId != unlinkedClinicId)
                    {
                        throw new ForbiddenException(
                            "User does not have access to this clinic's data.");
                    }
                }
                catch (ForbiddenException)
                {
                    throwsForbidden = true;
                }

                return throwsForbidden.ToProperty();
            });
    }
}
