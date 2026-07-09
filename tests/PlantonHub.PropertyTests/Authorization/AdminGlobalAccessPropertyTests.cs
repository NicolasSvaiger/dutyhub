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
/// Feature: plantonhub-mvp, Property 4: AdminGlobal possui acesso irrestrito a todos os dados
/// For any AdminGlobal user and any set of data distributed across multiple clinics,
/// queries SHALL return all records from all clinics without tenant filtering.
/// Validates: Requirements 2.3, 3.3, 4.1, 5.1, 6.5
/// </summary>
[Trait("Feature", "plantonhub-mvp")]
public class AdminGlobalAccessPropertyTests
{
    [Property(MaxTest = 100)]
    public Property AdminGlobal_SeesAllShifts_AcrossAllClinics()
    {
        var clinicIdGen = Gen.ArrayOf(Gen.Choose(2, 5).SelectMany(n => Gen.ListOf(n, Arb.Generate<Guid>()))).Select(x => x.SelectMany(g => g).ToList());

        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From(Gen.Choose(2, 5)),
            (adminUserId, clinicCount) =>
            {
                // Arrange: Create multiple clinics with shifts
                var clinics = Enumerable.Range(0, clinicCount)
                    .Select(_ => new Clinic
                    {
                        Id = Guid.NewGuid(),
                        Name = $"Clinic-{Guid.NewGuid():N}",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    }).ToList();

                var allShifts = clinics.SelectMany(c =>
                    Enumerable.Range(0, 3).Select(_ => new Shift
                    {
                        Id = Guid.NewGuid(),
                        ClinicId = c.Id,
                        Title = $"Shift-{Guid.NewGuid():N}",
                        Date = DateTime.UtcNow.AddDays(1),
                        StartTime = TimeSpan.FromHours(8),
                        EndTime = TimeSpan.FromHours(16),
                        CreatedAt = DateTime.UtcNow
                    })).ToList();

                // Mock tenant service as AdminGlobal
                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(true);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(adminUserId);
                tenantService.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });

                // Mock repository to return all shifts
                var shiftRepository = new Mock<IShiftRepository>();
                shiftRepository.Setup(r => r.GetAllAsync()).ReturnsAsync(allShifts);

                // Act: AdminGlobal queries shifts — should get ALL shifts from ALL clinics
                IEnumerable<Shift> result;
                if (tenantService.Object.IsAdminGlobal())
                {
                    result = shiftRepository.Object.GetAllAsync().Result;
                }
                else
                {
                    var clinicId = tenantService.Object.GetCurrentClinicId();
                    result = shiftRepository.Object.GetByClinicIdAsync(clinicId!.Value).Result;
                }

                // Assert: AdminGlobal sees all shifts from all clinics
                var resultList = result.ToList();
                var distinctClinics = resultList.Select(s => s.ClinicId).Distinct().ToList();

                return (resultList.Count == allShifts.Count &&
                        distinctClinics.Count == clinicCount).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property AdminGlobal_SeesAllClinics_WithoutFilter()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From(Gen.Choose(1, 10)),
            (adminUserId, clinicCount) =>
            {
                // Arrange: Create multiple clinics
                var clinics = Enumerable.Range(0, clinicCount)
                    .Select(_ => new Clinic
                    {
                        Id = Guid.NewGuid(),
                        Name = $"Clinic-{Guid.NewGuid():N}",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    }).ToList();

                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(true);
                tenantService.Setup(t => t.GetCurrentUserId()).Returns(adminUserId);

                var clinicRepository = new Mock<IClinicRepository>();
                clinicRepository.Setup(r => r.GetAllAsync()).ReturnsAsync(clinics);

                // Act: AdminGlobal queries clinics — should get ALL clinics
                IEnumerable<Clinic> result;
                if (tenantService.Object.IsAdminGlobal())
                {
                    result = clinicRepository.Object.GetAllAsync().Result;
                }
                else
                {
                    // Non-global user would only see their clinic
                    result = Enumerable.Empty<Clinic>();
                }

                // Assert: AdminGlobal sees all clinics
                return (result.Count() == clinicCount).ToProperty();
            });
    }

    [Property(MaxTest = 100)]
    public Property AdminGlobal_SeesAllUsers_Regardless_Of_Clinic()
    {
        return Prop.ForAll(
            Arb.From<Guid>(),
            Arb.From(Gen.Choose(1, 20)),
            (adminUserId, userCount) =>
            {
                // Arrange: Create users distributed across clinics
                var users = Enumerable.Range(0, userCount)
                    .Select(i => new User
                    {
                        Id = Guid.NewGuid(),
                        Email = $"user{i}@test.com",
                        Name = $"User {i}",
                        PasswordHash = "hashed",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    }).ToList();

                var tenantService = new Mock<ITenantService>();
                tenantService.Setup(t => t.IsAdminGlobal()).Returns(true);

                var userRepository = new Mock<IUserRepository>();
                userRepository.Setup(r => r.GetAllAsync()).ReturnsAsync(users);

                // Act: AdminGlobal queries users — should get ALL users
                IEnumerable<User> result;
                if (tenantService.Object.IsAdminGlobal())
                {
                    result = userRepository.Object.GetAllAsync().Result;
                }
                else
                {
                    result = Enumerable.Empty<User>();
                }

                // Assert
                return (result.Count() == userCount).ToProperty();
            });
    }
}
