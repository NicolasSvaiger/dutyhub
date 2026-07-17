using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Availability;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Cobre AvailabilityService — regras de disponibilidade dos profissionais.
///  • Escopo por role (AdminGlobal vs AdminClinica)
///  • Cálculo de status hoje (Ferias/Licenca/Afastado/Restricao/Disponivel)
///  • Validação de campos por tipo (RestricaoTurno exige mask, DiasEspecificos idem)
///  • Delete gated por clinica autorizada para AdminClinica
/// </summary>
public class AvailabilityServiceTests
{
    private readonly Mock<IAvailabilityRestrictionRepository> _restrictionRepo = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<ITenantService> _tenant = new();

    private AvailabilityService CreateService() =>
        new(_restrictionRepo.Object, _userRepo.Object, _clinicRepo.Object, _tenant.Object);

    private static User MakeMedico(Guid id, string name = "Dr. Teste", List<UserClinicRole>? roles = null) => new()
    {
        Id = id,
        Name = name,
        Email = $"{id}@x.com",
        PasswordHash = "h",
        IsActive = true,
        ProfessionalType = ProfessionalType.Medico,
        RegistrationNumber = "CRM 0000",
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
        UserClinicRoles = roles ?? new List<UserClinicRole>(),
    };

    private static UserClinicRole MakeRole(Guid userId, Guid clinicId, RoleType role = RoleType.Medico) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        ClinicId = clinicId,
        Role = role,
        AssignedAt = DateTime.UtcNow,
    };

    private static AvailabilityRestriction MakeRestriction(Guid userId, AvailabilityRestrictionType type,
        DateTime start, DateTime end, User? user = null, int? shiftsMask = null, int? weekdaysMask = null) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Type = type,
        StartDate = DateTime.SpecifyKind(start.Date, DateTimeKind.Utc),
        EndDate = DateTime.SpecifyKind(end.Date, DateTimeKind.Utc),
        BlockedShiftsMask = shiftsMask,
        BlockedWeekdaysMask = weekdaysMask,
        CreatedAt = DateTime.UtcNow,
        User = user ?? MakeMedico(userId),
    };

    // ─── Autorização ────────────────────────────────────────────────────

    [Fact]
    public async Task GetProfessionalsAvailability_NonAdmin_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "Medico" });

        var act = () => CreateService().GetProfessionalsAvailabilityAsync();

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task CreateRestriction_NonAdmin_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "Medico" });

        var act = () => CreateService().CreateRestrictionAsync(new CreateAvailabilityRestrictionRequest
        {
            UserId = Guid.NewGuid(),
            Type = AvailabilityRestrictionType.Ferias,
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(5),
        });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ─── Escopo por role ────────────────────────────────────────────────

    [Fact]
    public async Task GetProfessionalsAvailability_AdminGlobal_ReturnsAllProfessionals()
    {
        var m1 = MakeMedico(Guid.NewGuid(), "Dr. A");
        var m2 = MakeMedico(Guid.NewGuid(), "Dra. B");
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { m1, m2 });
        _restrictionRepo.Setup(r => r.GetByUserIdsAsync(It.IsAny<IEnumerable<Guid>>()))
            .ReturnsAsync(Enumerable.Empty<AvailabilityRestriction>());

        var result = (await CreateService().GetProfessionalsAvailabilityAsync()).ToList();

        result.Should().HaveCount(2);
        result.Select(r => r.UserName).Should().Contain(new[] { "Dr. A", "Dra. B" });
    }

    [Fact]
    public async Task GetProfessionalsAvailability_AdminClinica_ExcludesProfessionalsFromOtherClinics()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var m1 = MakeMedico(Guid.NewGuid(), "Dr. Meu");
        m1.UserClinicRoles!.Add(MakeRole(m1.Id, clinicA));
        var m2 = MakeMedico(Guid.NewGuid(), "Dr. Outro");
        m2.UserClinicRoles!.Add(MakeRole(m2.Id, clinicB));

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicA });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { m1, m2 });
        _restrictionRepo.Setup(r => r.GetByUserIdsAsync(It.IsAny<IEnumerable<Guid>>()))
            .ReturnsAsync(Enumerable.Empty<AvailabilityRestriction>());

        var result = (await CreateService().GetProfessionalsAvailabilityAsync()).ToList();

        result.Should().ContainSingle(r => r.UserId == m1.Id);
        result.Should().NotContain(r => r.UserId == m2.Id);
    }

    [Fact]
    public async Task GetProfessionalsAvailability_ExcludesAdminAndInactiveUsers()
    {
        var medico = MakeMedico(Guid.NewGuid(), "Dr. Ativo");
        var inactive = MakeMedico(Guid.NewGuid(), "Dr. Inativo");
        inactive.IsActive = false;
        var adminOnly = new User
        {
            Id = Guid.NewGuid(), Name = "Admin", Email = "a@x.com", PasswordHash = "h",
            IsActive = true, ProfessionalType = null, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            UserClinicRoles = new List<UserClinicRole>(),
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { medico, inactive, adminOnly });
        _restrictionRepo.Setup(r => r.GetByUserIdsAsync(It.IsAny<IEnumerable<Guid>>()))
            .ReturnsAsync(Enumerable.Empty<AvailabilityRestriction>());

        var result = (await CreateService().GetProfessionalsAvailabilityAsync()).ToList();

        result.Should().ContainSingle();
        result[0].UserName.Should().Be("Dr. Ativo");
    }

    // ─── Cálculo de status hoje ─────────────────────────────────────────

    [Fact]
    public async Task GetProfessionalsAvailability_ActiveFerias_StatusIsFerias()
    {
        var medico = MakeMedico(Guid.NewGuid(), "Dr. Férias");
        var today = DateTime.UtcNow.Date;
        var restriction = MakeRestriction(medico.Id, AvailabilityRestrictionType.Ferias,
            today.AddDays(-3), today.AddDays(10), medico);

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { medico });
        _restrictionRepo.Setup(r => r.GetByUserIdsAsync(It.IsAny<IEnumerable<Guid>>()))
            .ReturnsAsync(new[] { restriction });

        var result = (await CreateService().GetProfessionalsAvailabilityAsync()).Single();

        result.Status.Should().Be("Ferias");
        result.StatusLabel.Should().Be("Férias");
        result.Restrictions.Should().ContainSingle();
    }

    [Fact]
    public async Task GetProfessionalsAvailability_ExpiredRestriction_StatusIsDisponivel()
    {
        var medico = MakeMedico(Guid.NewGuid(), "Dr. Livre");
        var today = DateTime.UtcNow.Date;
        // Férias que já terminaram há 2 dias — não impactam status hoje
        var restriction = MakeRestriction(medico.Id, AvailabilityRestrictionType.Ferias,
            today.AddDays(-10), today.AddDays(-2), medico);

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { medico });
        _restrictionRepo.Setup(r => r.GetByUserIdsAsync(It.IsAny<IEnumerable<Guid>>()))
            .ReturnsAsync(new[] { restriction });

        var result = (await CreateService().GetProfessionalsAvailabilityAsync()).Single();

        result.Status.Should().Be("Disponivel");
        result.Restrictions.Should().ContainSingle(); // Histórico preservado
    }

    [Fact]
    public async Task GetProfessionalsAvailability_FeriasHasPriorityOverRestricao()
    {
        var medico = MakeMedico(Guid.NewGuid());
        var today = DateTime.UtcNow.Date;
        var ferias = MakeRestriction(medico.Id, AvailabilityRestrictionType.Ferias, today, today.AddDays(5), medico);
        var restricao = MakeRestriction(medico.Id, AvailabilityRestrictionType.DiasEspecificos,
            today.AddDays(-30), today.AddDays(30), medico, weekdaysMask: 0b0000001);

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { medico });
        _restrictionRepo.Setup(r => r.GetByUserIdsAsync(It.IsAny<IEnumerable<Guid>>()))
            .ReturnsAsync(new[] { ferias, restricao });

        var result = (await CreateService().GetProfessionalsAvailabilityAsync()).Single();

        result.Status.Should().Be("Ferias");
    }

    [Fact]
    public async Task GetProfessionalsAvailability_OnlyRecurringRestricao_StatusIsRestricao()
    {
        var medico = MakeMedico(Guid.NewGuid());
        var today = DateTime.UtcNow.Date;
        var restricao = MakeRestriction(medico.Id, AvailabilityRestrictionType.DiasEspecificos,
            today.AddDays(-30), today.AddDays(30), medico, weekdaysMask: 0b1000001);

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { medico });
        _restrictionRepo.Setup(r => r.GetByUserIdsAsync(It.IsAny<IEnumerable<Guid>>()))
            .ReturnsAsync(new[] { restricao });

        var result = (await CreateService().GetProfessionalsAvailabilityAsync()).Single();

        result.Status.Should().Be("Restricao");
    }

    // ─── Create: validações ─────────────────────────────────────────────

    [Fact]
    public async Task CreateRestriction_EndBeforeStart_ThrowsBadRequest()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });

        var act = () => CreateService().CreateRestrictionAsync(new CreateAvailabilityRestrictionRequest
        {
            UserId = Guid.NewGuid(),
            Type = AvailabilityRestrictionType.Ferias,
            StartDate = DateTime.UtcNow.AddDays(5),
            EndDate = DateTime.UtcNow,
        });

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task CreateRestriction_RestricaoTurnoWithoutMask_ThrowsBadRequest()
    {
        var medico = MakeMedico(Guid.NewGuid());
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetByIdAsync(medico.Id)).ReturnsAsync(medico);

        var act = () => CreateService().CreateRestrictionAsync(new CreateAvailabilityRestrictionRequest
        {
            UserId = medico.Id,
            Type = AvailabilityRestrictionType.RestricaoTurno,
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(30),
            BlockedShiftsMask = null,
        });

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task CreateRestriction_DiasEspecificosWithoutMask_ThrowsBadRequest()
    {
        var medico = MakeMedico(Guid.NewGuid());
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetByIdAsync(medico.Id)).ReturnsAsync(medico);

        var act = () => CreateService().CreateRestrictionAsync(new CreateAvailabilityRestrictionRequest
        {
            UserId = medico.Id,
            Type = AvailabilityRestrictionType.DiasEspecificos,
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(90),
            BlockedWeekdaysMask = 0,
        });

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task CreateRestriction_UserNotFound_ThrowsNotFound()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var act = () => CreateService().CreateRestrictionAsync(new CreateAvailabilityRestrictionRequest
        {
            UserId = Guid.NewGuid(),
            Type = AvailabilityRestrictionType.Ferias,
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(5),
        });

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task CreateRestriction_AdminClinicaTargetingOtherClinicUser_ThrowsForbidden()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var target = MakeMedico(Guid.NewGuid());
        target.UserClinicRoles!.Add(MakeRole(target.Id, clinicB));

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicA });
        _userRepo.Setup(r => r.GetByIdAsync(target.Id)).ReturnsAsync(target);

        var act = () => CreateService().CreateRestrictionAsync(new CreateAvailabilityRestrictionRequest
        {
            UserId = target.Id,
            Type = AvailabilityRestrictionType.Ferias,
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(5),
        });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task CreateRestriction_ValidFerias_PersistsAndReturns()
    {
        var medico = MakeMedico(Guid.NewGuid(), "Dr. Novo");
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(Guid.NewGuid());
        _userRepo.Setup(r => r.GetByIdAsync(medico.Id)).ReturnsAsync(medico);

        AvailabilityRestriction? captured = null;
        _restrictionRepo.Setup(r => r.AddAsync(It.IsAny<AvailabilityRestriction>()))
            .Callback<AvailabilityRestriction>(r => captured = r)
            .Returns(Task.CompletedTask);
        _restrictionRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((Guid id) =>
            {
                if (captured is null) return null;
                captured.User = medico;
                return captured;
            });

        var result = await CreateService().CreateRestrictionAsync(new CreateAvailabilityRestrictionRequest
        {
            UserId = medico.Id,
            Type = AvailabilityRestrictionType.Ferias,
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(10),
            Notes = "Férias programadas",
        });

        result.UserId.Should().Be(medico.Id);
        result.Type.Should().Be(AvailabilityRestrictionType.Ferias);
        result.Notes.Should().Be("Férias programadas");
        _restrictionRepo.Verify(r => r.AddAsync(It.IsAny<AvailabilityRestriction>()), Times.Once);
    }

    [Fact]
    public async Task CreateRestriction_RestricaoTurno_PersistsMaskAndDiscardsWeekdaysMask()
    {
        var medico = MakeMedico(Guid.NewGuid());
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetByIdAsync(medico.Id)).ReturnsAsync(medico);

        AvailabilityRestriction? captured = null;
        _restrictionRepo.Setup(r => r.AddAsync(It.IsAny<AvailabilityRestriction>()))
            .Callback<AvailabilityRestriction>(r => captured = r)
            .Returns(Task.CompletedTask);
        _restrictionRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(() => { if (captured != null) captured.User = medico; return captured; });

        await CreateService().CreateRestrictionAsync(new CreateAvailabilityRestrictionRequest
        {
            UserId = medico.Id,
            Type = AvailabilityRestrictionType.RestricaoTurno,
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(90),
            BlockedShiftsMask = 0b100, // só noite
            BlockedWeekdaysMask = 0b1111111, // ignorado no service
        });

        captured!.BlockedShiftsMask.Should().Be(0b100);
        captured!.BlockedWeekdaysMask.Should().BeNull();
    }

    // ─── Delete ─────────────────────────────────────────────────────────

    [Fact]
    public async Task DeleteRestriction_NotFound_ThrowsNotFound()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _restrictionRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((AvailabilityRestriction?)null);

        var act = () => CreateService().DeleteRestrictionAsync(Guid.NewGuid());

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task DeleteRestriction_AdminClinicaOfOtherClinic_ThrowsForbidden()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var target = MakeMedico(Guid.NewGuid());
        target.UserClinicRoles!.Add(MakeRole(target.Id, clinicB));
        var restriction = MakeRestriction(target.Id, AvailabilityRestrictionType.Ferias,
            DateTime.UtcNow, DateTime.UtcNow.AddDays(5), target);

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicA });
        _restrictionRepo.Setup(r => r.GetByIdAsync(restriction.Id)).ReturnsAsync(restriction);
        _userRepo.Setup(r => r.GetByIdAsync(target.Id)).ReturnsAsync(target);

        var act = () => CreateService().DeleteRestrictionAsync(restriction.Id);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task DeleteRestriction_AdminGlobal_Deletes()
    {
        var restriction = MakeRestriction(Guid.NewGuid(), AvailabilityRestrictionType.Ferias,
            DateTime.UtcNow, DateTime.UtcNow.AddDays(5));

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _restrictionRepo.Setup(r => r.GetByIdAsync(restriction.Id)).ReturnsAsync(restriction);
        _restrictionRepo.Setup(r => r.DeleteAsync(restriction)).Returns(Task.CompletedTask);

        await CreateService().DeleteRestrictionAsync(restriction.Id);

        _restrictionRepo.Verify(r => r.DeleteAsync(restriction), Times.Once);
    }
}
