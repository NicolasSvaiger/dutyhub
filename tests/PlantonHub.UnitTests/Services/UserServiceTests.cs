using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Users;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

public class UserServiceTests
{
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<IPasswordHashService> _hasher = new();
    private readonly Mock<ICacheService> _cache = new();

    private UserService CreateService() =>
        new(_userRepo.Object, _clinicRepo.Object, _tenant.Object, _hasher.Object, _cache.Object);

    private static User MakeUser(Guid? id = null, string name = "Usuário Teste", bool isActive = true,
        ProfessionalType? professionalType = null, List<UserClinicRole>? roles = null) => new()
    {
        Id = id ?? Guid.NewGuid(),
        Name = name,
        Email = $"{Guid.NewGuid()}@teste.com",
        PasswordHash = "hash",
        IsActive = isActive,
        ProfessionalType = professionalType,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
        UserClinicRoles = roles ?? new List<UserClinicRole>(),
    };

    private static UserClinicRole MakeRole(Guid userId, Guid clinicId, RoleType role) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        ClinicId = clinicId,
        Role = role,
        AssignedAt = DateTime.UtcNow,
    };

    // ─── GetAdminUsersAsync ─────────────────────────────────────────────────

    [Fact]
    public async Task GetAdminUsersAsync_AdminGlobal_ReturnsAllAdminAndGlobalUsers_ExcludesProfessionals()
    {
        var clinicId = Guid.NewGuid();
        var adminGlobalUser = MakeUser(name: "Admin Global");
        adminGlobalUser.UserClinicRoles!.Add(MakeRole(adminGlobalUser.Id, clinicId, RoleType.AdminGlobal));

        var adminClinicaUser = MakeUser(name: "Admin OS");
        adminClinicaUser.UserClinicRoles!.Add(MakeRole(adminClinicaUser.Id, clinicId, RoleType.AdminClinica));

        var medico = MakeUser(name: "Dr João", professionalType: ProfessionalType.Medico);
        medico.UserClinicRoles!.Add(MakeRole(medico.Id, clinicId, RoleType.Medico));

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { adminGlobalUser, adminClinicaUser, medico });

        var result = (await CreateService().GetAdminUsersAsync()).ToList();

        result.Should().HaveCount(2);
        result.Select(u => u.Name).Should().Contain(new[] { "Admin Global", "Admin OS" });
        result.Select(u => u.Name).Should().NotContain("Dr João");
    }

    [Fact]
    public async Task GetAdminUsersAsync_AdminClinica_NoAuthorizedClinics_ReturnsEmpty()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Enumerable.Empty<Guid>());

        var result = await CreateService().GetAdminUsersAsync();

        result.Should().BeEmpty();
        _userRepo.Verify(r => r.GetAllAsync(), Times.Never);
    }

    [Fact]
    public async Task GetAdminUsersAsync_AdminClinica_ReturnsOnlyAdminsOfSameClinics()
    {
        var myClinicId = Guid.NewGuid();
        var otherClinicId = Guid.NewGuid();

        var sameOrgAdmin = MakeUser(name: "Admin Mesma OS");
        sameOrgAdmin.UserClinicRoles!.Add(MakeRole(sameOrgAdmin.Id, myClinicId, RoleType.AdminClinica));

        var otherOrgAdmin = MakeUser(name: "Admin Outra OS");
        otherOrgAdmin.UserClinicRoles!.Add(MakeRole(otherOrgAdmin.Id, otherClinicId, RoleType.AdminClinica));

        var globalAdmin = MakeUser(name: "Admin Global");
        globalAdmin.UserClinicRoles!.Add(MakeRole(globalAdmin.Id, myClinicId, RoleType.AdminGlobal));

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { myClinicId });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { sameOrgAdmin, otherOrgAdmin, globalAdmin });

        var result = (await CreateService().GetAdminUsersAsync()).ToList();

        // AdminClinica only sees AdminClinica users sharing their clinics — not AdminGlobal, not other orgs.
        result.Should().HaveCount(1);
        result[0].Name.Should().Be("Admin Mesma OS");
    }

    [Fact]
    public async Task GetAdminUsersAsync_AdminGlobal_NoAdminUsers_ReturnsEmpty()
    {
        var medico = MakeUser(professionalType: ProfessionalType.Medico);
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { medico });

        var result = await CreateService().GetAdminUsersAsync();

        result.Should().BeEmpty();
    }

    // ─── GetAllAsync ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAllAsync_NonAdminNonClinica_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "Medico" });

        var act = () => CreateService().GetAllAsync();

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task GetAllAsync_AdminGlobal_ReturnsAllUsers()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { MakeUser(), MakeUser() });

        var result = await CreateService().GetAllAsync();

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetAllAsync_AdminClinica_ReturnsOnlyProfessionals()
    {
        var medico = MakeUser(professionalType: ProfessionalType.Medico);
        var adminOutro = MakeUser(); // no professional type, no Medico/Enfermeiro role

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { medico, adminOutro });

        var result = (await CreateService().GetAllAsync()).ToList();

        result.Should().ContainSingle();
        result[0].Id.Should().Be(medico.Id);
    }

    // ─── CreateAsync ────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateAsync_NonAdminNonClinica_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "Medico" });

        var act = () => CreateService().CreateAsync(new CreateUserRequest { Name = "X", Email = "x@x.com", Password = "Aa123456!" });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task CreateAsync_EmailAlreadyExists_ThrowsConflict()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.EmailExistsAsync(It.IsAny<string>())).ReturnsAsync(true);

        var act = () => CreateService().CreateAsync(new CreateUserRequest { Name = "X", Email = "dup@x.com", Password = "Aa123456!" });

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task CreateAsync_ValidRequest_HashesPasswordAndPersists()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.EmailExistsAsync(It.IsAny<string>())).ReturnsAsync(false);
        _hasher.Setup(h => h.HashPassword("Aa123456!")).Returns("hashed-pwd");
        _userRepo.Setup(r => r.AddAsync(It.IsAny<User>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var result = await CreateService().CreateAsync(new CreateUserRequest
        {
            Name = "Novo Admin",
            Email = "novo@x.com",
            Password = "Aa123456!",
        });

        result.Name.Should().Be("Novo Admin");
        result.IsActive.Should().BeTrue();
        _userRepo.Verify(r => r.AddAsync(It.Is<User>(u => u.PasswordHash == "hashed-pwd" && u.Name == "Novo Admin")), Times.Once);
    }

    [Fact]
    public async Task CreateAsync_InvalidatesUsersCache()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.EmailExistsAsync(It.IsAny<string>())).ReturnsAsync(false);
        _userRepo.Setup(r => r.AddAsync(It.IsAny<User>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync("users:", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await CreateService().CreateAsync(new CreateUserRequest { Name = "X", Email = "x@x.com", Password = "Aa123456!" });

        _cache.Verify(c => c.RemoveByPrefixAsync("users:", It.IsAny<CancellationToken>()), Times.Once);
    }

    // ─── AssignClinicRoleAsync ──────────────────────────────────────────────

    [Fact]
    public async Task AssignClinicRoleAsync_NonAdminNonClinica_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "Medico" });

        var act = () => CreateService().AssignClinicRoleAsync(Guid.NewGuid(), new AssignRoleRequest { ClinicId = Guid.NewGuid(), Role = RoleType.AdminClinica });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task AssignClinicRoleAsync_AdminClinica_UnauthorizedClinic_ThrowsForbidden()
    {
        var otherClinicId = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { Guid.NewGuid() });

        var act = () => CreateService().AssignClinicRoleAsync(Guid.NewGuid(), new AssignRoleRequest { ClinicId = otherClinicId, Role = RoleType.AdminClinica });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task AssignClinicRoleAsync_UserNotFound_ThrowsNotFound()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var act = () => CreateService().AssignClinicRoleAsync(Guid.NewGuid(), new AssignRoleRequest { ClinicId = Guid.NewGuid(), Role = RoleType.AdminClinica });

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task AssignClinicRoleAsync_ClinicNotFound_ThrowsNotFound()
    {
        var userId = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(MakeUser(userId));
        _clinicRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Clinic?)null);

        var act = () => CreateService().AssignClinicRoleAsync(userId, new AssignRoleRequest { ClinicId = Guid.NewGuid(), Role = RoleType.AdminClinica });

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task AssignClinicRoleAsync_ValidRequest_AddsRoleAndInvalidatesCache()
    {
        var userId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(MakeUser(userId));
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(new Clinic
        {
            Id = clinicId, Name = "UPA X", Address = "Rua 1", Phone = "119999", IsActive = true,
            ShiftTemplates = new List<ClinicShiftTemplate>(),
        });
        _userRepo.Setup(r => r.AddClinicRoleAsync(It.IsAny<UserClinicRole>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await CreateService().AssignClinicRoleAsync(userId, new AssignRoleRequest { ClinicId = clinicId, Role = RoleType.AdminClinica });

        _userRepo.Verify(r => r.AddClinicRoleAsync(It.Is<UserClinicRole>(rc =>
            rc.UserId == userId && rc.ClinicId == clinicId && rc.Role == RoleType.AdminClinica)), Times.Once);
    }

    // ─── ToggleStatusAsync ──────────────────────────────────────────────────

    [Fact]
    public async Task ToggleStatusAsync_NonAdminNonClinica_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "Medico" });

        var act = () => CreateService().ToggleStatusAsync(Guid.NewGuid());

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task ToggleStatusAsync_UserNotFound_ReturnsNull()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var result = await CreateService().ToggleStatusAsync(Guid.NewGuid());

        result.Should().BeNull();
    }

    [Fact]
    public async Task ToggleStatusAsync_ActiveUser_BecomesInactive()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminGlobal" });
        _userRepo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeUser(id, isActive: true));
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var result = await CreateService().ToggleStatusAsync(id);

        result!.IsActive.Should().BeFalse();
    }

}
