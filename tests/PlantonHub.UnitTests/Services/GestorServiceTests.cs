using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Gestores;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Cobre o pipeline administrativo de cadastro de gestores públicos:
/// autorização, criação transacional (Postgres + Cognito + UserPublicOrganRole)
/// com rollback compensatório, update/toggle/remove. Mocks isolam cada
/// dependência — nenhum acesso real ao Cognito ou DB.
/// </summary>
public class GestorServiceTests
{
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<IUserPublicOrganRoleRepository> _rolesRepo = new();
    private readonly Mock<IPublicOrganRepository> _organRepo = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<ICognitoAuthService> _cognito = new();
    private readonly Mock<ICacheService> _cache = new();

    private GestorService CreateService() =>
        new(_userRepo.Object, _rolesRepo.Object, _organRepo.Object,
            _tenant.Object, _cognito.Object, _cache.Object);

    private void SetAdminGlobal(bool value = true)
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(value);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(
            value ? new[] { "AdminGlobal" } : new[] { "AdminClinica" });
    }

    private void SetAdminClinica()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "AdminClinica" });
    }

    private void SetNoAdmin()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetCurrentRoles()).Returns(new[] { "Medico" });
    }

    private static PublicOrgan MakeOrgan(Guid? id = null, string name = "Prefeitura Teste") => new()
    {
        Id = id ?? Guid.NewGuid(),
        Name = name,
        Acronym = "PT",
        City = "Cidade Teste",
        State = "SP",
        IsActive = true,
        CreatedAt = DateTime.UtcNow,
    };

    private static User MakeUser(Guid? id = null, string email = "gestor@example.com",
        string name = "Gestor Teste", bool isActive = true) => new()
    {
        Id = id ?? Guid.NewGuid(),
        Email = email,
        Name = name,
        PasswordHash = "hash",
        IsActive = isActive,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    private static UserPublicOrganRole MakeRole(Guid userId, Guid organId, User? user = null, PublicOrgan? organ = null) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        PublicOrganId = organId,
        Role = RoleType.GestorPublico,
        AssignedAt = DateTime.UtcNow,
        User = user!,
        PublicOrgan = organ!,
    };

    // ─── GetAllAsync ───────────────────────────────────────────────────────

    [Fact]
    public async Task GetAllAsync_WithPublicOrganId_QueriesOnlyThatOrgan()
    {
        SetAdminGlobal();
        var organId = Guid.NewGuid();
        var user = MakeUser();
        var organ = MakeOrgan(organId);
        _rolesRepo
            .Setup(r => r.GetByOrganIdAsync(organId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { MakeRole(user.Id, organId, user, organ) });

        var result = (await CreateService().GetAllAsync(organId)).ToList();

        result.Should().HaveCount(1);
        result[0].PublicOrganId.Should().Be(organId);
        _organRepo.Verify(r => r.GetAllAsync(), Times.Never);
    }

    [Fact]
    public async Task GetAllAsync_WithoutFilter_IteratesAllOrgans()
    {
        SetAdminGlobal();
        var organ1 = MakeOrgan();
        var organ2 = MakeOrgan();
        _organRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { organ1, organ2 });
        _rolesRepo
            .Setup(r => r.GetByOrganIdAsync(organ1.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { MakeRole(Guid.NewGuid(), organ1.Id, MakeUser(email: "a@x.com"), organ1) });
        _rolesRepo
            .Setup(r => r.GetByOrganIdAsync(organ2.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { MakeRole(Guid.NewGuid(), organ2.Id, MakeUser(email: "b@x.com"), organ2) });

        var result = (await CreateService().GetAllAsync()).ToList();

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetAllAsync_AdminClinicaCanRead()
    {
        SetAdminClinica();
        var organId = Guid.NewGuid();
        _rolesRepo
            .Setup(r => r.GetByOrganIdAsync(organId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<UserPublicOrganRole>());

        var act = () => CreateService().GetAllAsync(organId);

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task GetAllAsync_NonAdmin_Throws403()
    {
        SetNoAdmin();

        var act = () => CreateService().GetAllAsync();

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ─── GetByIdAsync ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetByIdAsync_UserWithoutOrganRole_ReturnsNull()
    {
        SetAdminGlobal();
        var userId = Guid.NewGuid();
        _rolesRepo
            .Setup(r => r.GetByUserIdAsync(userId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<UserPublicOrganRole>());

        var result = await CreateService().GetByIdAsync(userId);

        result.Should().BeNull();
    }

    // ─── CreateAsync — autorização ─────────────────────────────────────────

    [Fact]
    public async Task CreateAsync_AdminClinica_Throws403()
    {
        SetAdminClinica();
        var request = new CreateGestorRequest
        {
            Name = "Novo Gestor",
            Email = "novo@example.com",
            PublicOrganId = Guid.NewGuid(),
        };

        var act = () => CreateService().CreateAsync(request);

        await act.Should().ThrowAsync<ForbiddenException>();
        _userRepo.Verify(r => r.AddAsync(It.IsAny<User>()), Times.Never);
        _cognito.Verify(c => c.CreateInvitedUserAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    // ─── CreateAsync — happy path ──────────────────────────────────────────

    [Fact]
    public async Task CreateAsync_HappyPath_PersistsUserAndCognitoAndRole()
    {
        SetAdminGlobal();
        var organId = Guid.NewGuid();
        var organ = MakeOrgan(organId);
        _userRepo.Setup(r => r.EmailExistsAsync(It.IsAny<string>())).ReturnsAsync(false);
        _organRepo.Setup(r => r.GetByIdAsync(organId)).ReturnsAsync(organ);

        var result = await CreateService().CreateAsync(new CreateGestorRequest
        {
            Name = "  Novo Gestor  ",
            Email = "  Novo@Exemplo.COM  ",
            Phone = " 11999998888 ",
            PublicOrganId = organId,
        });

        result.Should().NotBeNull();
        result.PublicOrganId.Should().Be(organId);
        result.PublicOrganName.Should().Be(organ.Name);
        result.IsActive.Should().BeTrue();

        // Verifica ordem correta: DB → Cognito → Role
        _userRepo.Verify(r => r.AddAsync(It.Is<User>(u =>
            u.Email == "novo@exemplo.com" &&  // normalizado lowercase + trim
            u.Name == "Novo Gestor" &&        // trim
            u.Phone == "11999998888")), Times.Once);
        _cognito.Verify(c => c.CreateInvitedUserAsync("novo@exemplo.com", "Novo Gestor"), Times.Once);
        _rolesRepo.Verify(r => r.AddAsync(
            It.Is<UserPublicOrganRole>(x =>
                x.PublicOrganId == organId &&
                x.Role == RoleType.GestorPublico),
            It.IsAny<CancellationToken>()), Times.Once);

        // Invalida cache do PrefeituraService pro novo gestor enxergar
        // o organ no próximo login sem esperar TTL.
        _cache.Verify(c => c.RemoveByPrefixAsync("prefeitura:", It.IsAny<CancellationToken>()), Times.Once);
    }

    // ─── CreateAsync — validações prévias ──────────────────────────────────

    [Fact]
    public async Task CreateAsync_EmailAlreadyExists_ThrowsConflict()
    {
        SetAdminGlobal();
        _userRepo.Setup(r => r.EmailExistsAsync("existe@x.com")).ReturnsAsync(true);

        var act = () => CreateService().CreateAsync(new CreateGestorRequest
        {
            Name = "X",
            Email = "existe@x.com",
            PublicOrganId = Guid.NewGuid(),
        });

        await act.Should().ThrowAsync<ConflictException>();
        _userRepo.Verify(r => r.AddAsync(It.IsAny<User>()), Times.Never);
        _cognito.Verify(c => c.CreateInvitedUserAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task CreateAsync_PublicOrganNotFound_ThrowsNotFound()
    {
        SetAdminGlobal();
        var organId = Guid.NewGuid();
        _userRepo.Setup(r => r.EmailExistsAsync(It.IsAny<string>())).ReturnsAsync(false);
        _organRepo.Setup(r => r.GetByIdAsync(organId)).ReturnsAsync((PublicOrgan?)null);

        var act = () => CreateService().CreateAsync(new CreateGestorRequest
        {
            Name = "X",
            Email = "x@x.com",
            PublicOrganId = organId,
        });

        await act.Should().ThrowAsync<NotFoundException>();
        _userRepo.Verify(r => r.AddAsync(It.IsAny<User>()), Times.Never);
        _cognito.Verify(c => c.CreateInvitedUserAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    // ─── CreateAsync — rollback compensatório ──────────────────────────────

    [Fact]
    public async Task CreateAsync_CognitoFails_RollsBackPostgres()
    {
        SetAdminGlobal();
        var organ = MakeOrgan();
        _userRepo.Setup(r => r.EmailExistsAsync(It.IsAny<string>())).ReturnsAsync(false);
        _organRepo.Setup(r => r.GetByIdAsync(organ.Id)).ReturnsAsync(organ);
        _cognito
            .Setup(c => c.CreateInvitedUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .ThrowsAsync(new InvalidOperationException("Cognito indisponível"));

        var act = () => CreateService().CreateAsync(new CreateGestorRequest
        {
            Name = "Novo",
            Email = "novo@x.com",
            PublicOrganId = organ.Id,
        });

        await act.Should().ThrowAsync<InvalidOperationException>();

        // User foi criado E deletado (rollback)
        _userRepo.Verify(r => r.AddAsync(It.IsAny<User>()), Times.Once);
        _userRepo.Verify(r => r.DeleteAsync(It.IsAny<User>()), Times.Once);
        // Role não foi criado
        _rolesRepo.Verify(r => r.AddAsync(It.IsAny<UserPublicOrganRole>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateAsync_RoleFails_RollsBackBothCognitoAndPostgres()
    {
        SetAdminGlobal();
        var organ = MakeOrgan();
        _userRepo.Setup(r => r.EmailExistsAsync(It.IsAny<string>())).ReturnsAsync(false);
        _organRepo.Setup(r => r.GetByIdAsync(organ.Id)).ReturnsAsync(organ);
        _rolesRepo
            .Setup(r => r.AddAsync(It.IsAny<UserPublicOrganRole>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Falha no vínculo"));

        var act = () => CreateService().CreateAsync(new CreateGestorRequest
        {
            Name = "Novo",
            Email = "novo@x.com",
            PublicOrganId = organ.Id,
        });

        await act.Should().ThrowAsync<InvalidOperationException>();

        // Ambos os sistemas foram compensados
        _userRepo.Verify(r => r.DeleteAsync(It.IsAny<User>()), Times.Once);
        _cognito.Verify(c => c.DeleteUserAsync("novo@x.com"), Times.Once);
    }

    // ─── UpdateAsync ───────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_HappyPath_UpdatesNameAndPhone()
    {
        SetAdminGlobal();
        var user = MakeUser(name: "Nome Antigo");
        var organ = MakeOrgan();
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _rolesRepo
            .Setup(r => r.GetByUserIdAsync(user.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { MakeRole(user.Id, organ.Id, user, organ) });

        var result = await CreateService().UpdateAsync(user.Id, new UpdateGestorRequest
        {
            Name = "Nome Novo",
            Phone = "11888887777",
        });

        result.Should().NotBeNull();
        user.Name.Should().Be("Nome Novo");
        user.Phone.Should().Be("11888887777");
        _userRepo.Verify(r => r.UpdateAsync(user), Times.Once);
    }

    [Fact]
    public async Task UpdateAsync_UserNotFound_ReturnsNull()
    {
        SetAdminGlobal();
        var userId = Guid.NewGuid();
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync((User?)null);

        var result = await CreateService().UpdateAsync(userId, new UpdateGestorRequest { Name = "X" });

        result.Should().BeNull();
    }

    [Fact]
    public async Task UpdateAsync_UserExistsButNotAGestor_ReturnsNull()
    {
        // Guard: UpdateAsync do GestorService só edita quem tem
        // UserPublicOrganRole. Se o user existe mas não é gestor, a UI
        // não deveria estar chamando esse endpoint — devolvemos null
        // pra sinalizar "não é seu domínio".
        SetAdminGlobal();
        var user = MakeUser();
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _rolesRepo
            .Setup(r => r.GetByUserIdAsync(user.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<UserPublicOrganRole>());

        var result = await CreateService().UpdateAsync(user.Id, new UpdateGestorRequest { Name = "X" });

        result.Should().BeNull();
        _userRepo.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Never);
    }

    // ─── ToggleStatusAsync ─────────────────────────────────────────────────

    [Fact]
    public async Task ToggleStatusAsync_ActiveGestor_TurnsInactive()
    {
        SetAdminGlobal();
        var user = MakeUser(isActive: true);
        var organ = MakeOrgan();
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _rolesRepo
            .Setup(r => r.GetByUserIdAsync(user.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { MakeRole(user.Id, organ.Id, user, organ) });

        var result = await CreateService().ToggleStatusAsync(user.Id);

        result.Should().NotBeNull();
        user.IsActive.Should().BeFalse();
        _userRepo.Verify(r => r.UpdateAsync(user), Times.Once);
    }

    // ─── RemoveAsync ───────────────────────────────────────────────────────

    [Fact]
    public async Task RemoveAsync_RemovesUserPublicOrganRole_KeepsUser()
    {
        // LGPD: o User em si é preservado (audit trail precisa manter
        // referências). Só o vínculo com o organ é removido.
        SetAdminGlobal();
        var user = MakeUser();
        var organ = MakeOrgan();
        var role = MakeRole(user.Id, organ.Id, user, organ);
        _rolesRepo
            .Setup(r => r.GetByUserIdAsync(user.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { role });

        await CreateService().RemoveAsync(user.Id);

        _rolesRepo.Verify(r => r.RemoveAsync(role, It.IsAny<CancellationToken>()), Times.Once);
        _userRepo.Verify(r => r.DeleteAsync(It.IsAny<User>()), Times.Never);
        _cognito.Verify(c => c.DeleteUserAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task RemoveAsync_AdminClinica_Throws403()
    {
        SetAdminClinica();

        var act = () => CreateService().RemoveAsync(Guid.NewGuid());

        await act.Should().ThrowAsync<ForbiddenException>();
    }
}
