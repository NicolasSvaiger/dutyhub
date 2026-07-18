using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using PlantonHub.API.Middleware;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Middleware;

/// <summary>
/// Sprint 7A — Portal Prefeitura. Valida a resolução do <c>publicOrganId</c>
/// dentro do <see cref="TenantMiddleware"/>: fast path via claim JWT + fallback
/// DB via <see cref="IUserPublicOrganRoleRepository"/>. O fluxo é gated pelo
/// role <c>GestorPublico</c> (não faz DB lookup pra ninguém mais).
/// </summary>
public class TenantMiddlewarePublicOrganTests
{
    private static readonly RequestDelegate NoOpNext = _ => Task.CompletedTask;

    /// <summary>
    /// Monta um <see cref="HttpContext"/> autenticado + service provider com
    /// (opcional) mock do <see cref="IUserPublicOrganRoleRepository"/>. Todo
    /// teste dessa suite usa esse helper — a diferença fica só nos claims.
    /// </summary>
    private static DefaultHttpContext BuildContext(
        IEnumerable<Claim> claims,
        IUserPublicOrganRoleRepository? organRepo = null)
    {
        var identity = new ClaimsIdentity(claims, "TestAuth");
        var user = new ClaimsPrincipal(identity);

        var services = new ServiceCollection();
        if (organRepo is not null)
        {
            services.AddSingleton(organRepo);
        }

        var context = new DefaultHttpContext { User = user };
        context.RequestServices = services.BuildServiceProvider();
        return context;
    }

    private static TenantMiddleware CreateMiddleware()
        => new(NoOpNext, Mock.Of<ILogger<TenantMiddleware>>());

    [Fact]
    public async Task NonGestor_ShouldNotResolvePublicOrganId_EvenWithClaimPresent()
    {
        // Guard 1 do middleware: só resolve quando o user tem role
        // GestorPublico. Um Medico com um publicOrganId perdido no JWT
        // (não deveria acontecer, mas defesa em profundidade) não deve
        // vazar o organId pra downstream.
        var strayOrgan = Guid.NewGuid();
        var context = BuildContext(new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, Guid.NewGuid().ToString()),
            new Claim("roles", "Medico"),
            new Claim("publicOrganId", strayOrgan.ToString()),
        });

        await CreateMiddleware().InvokeAsync(context);

        context.Items.ContainsKey("CurrentPublicOrganId").Should().BeFalse();
    }

    [Fact]
    public async Task Gestor_WithPublicOrganIdClaim_ShouldSetCurrentPublicOrganIdFromClaim()
    {
        // Fast path: gestor + claim válido → não faz DB lookup, seta direto.
        var organId = Guid.NewGuid();
        var repoMock = new Mock<IUserPublicOrganRoleRepository>(MockBehavior.Strict);

        var context = BuildContext(new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, Guid.NewGuid().ToString()),
            new Claim("roles", "GestorPublico"),
            new Claim("publicOrganId", organId.ToString()),
        }, repoMock.Object);

        await CreateMiddleware().InvokeAsync(context);

        context.Items["CurrentPublicOrganId"].Should().Be(organId);
        // Strict mock não teve nenhuma call: fast path funcionou.
        repoMock.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Gestor_WithoutClaim_ShouldFallbackToDbLookup()
    {
        // Sem claim (Lambda pré-token não rodou, usuário legado): middleware
        // deve consultar IUserPublicOrganRoleRepository.GetByUserIdAsync com
        // o sub GUID e pegar o primeiro organ retornado.
        var userId = Guid.NewGuid();
        var organId = Guid.NewGuid();

        var repoMock = new Mock<IUserPublicOrganRoleRepository>();
        repoMock.Setup(r => r.GetByUserIdAsync(userId, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new[]
                {
                    new UserPublicOrganRole
                    {
                        Id = Guid.NewGuid(),
                        UserId = userId,
                        PublicOrganId = organId,
                        Role = RoleType.GestorPublico,
                        AssignedAt = DateTime.UtcNow,
                    },
                });

        var context = BuildContext(new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim("email", $"gestor-{userId}@example.com"), // email único evita colisão do _identityCache
            new Claim("roles", "GestorPublico"),
        }, repoMock.Object);

        await CreateMiddleware().InvokeAsync(context);

        context.Items["CurrentPublicOrganId"].Should().Be(organId);
        repoMock.Verify(r => r.GetByUserIdAsync(userId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Gestor_WhenDbLookupReturnsEmpty_ShouldNotSetCurrentPublicOrganId()
    {
        // Usuário com claim/group de gestor mas sem vínculo real no DB:
        // middleware retorna null (não seta) — downstream trata como 403.
        var userId = Guid.NewGuid();

        var repoMock = new Mock<IUserPublicOrganRoleRepository>();
        repoMock.Setup(r => r.GetByUserIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Array.Empty<UserPublicOrganRole>());

        var context = BuildContext(new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim("email", $"gestor-{userId}@example.com"),
            new Claim("roles", "GestorPublico"),
        }, repoMock.Object);

        await CreateMiddleware().InvokeAsync(context);

        context.Items.ContainsKey("CurrentPublicOrganId").Should().BeFalse();
    }

    [Fact]
    public async Task Gestor_ViaCognitoGroupsClaim_ShouldResolvePublicOrganId()
    {
        // IsGestorPublico deve reconhecer tanto o custom "roles" claim quanto
        // o "cognito:groups" nativo. Testa o path Cognito puro (Lambda desligada).
        var organId = Guid.NewGuid();

        var context = BuildContext(new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, Guid.NewGuid().ToString()),
            new Claim("cognito:groups", "GestorPublico"),
            new Claim("publicOrganId", organId.ToString()),
        });

        await CreateMiddleware().InvokeAsync(context);

        context.Items["CurrentPublicOrganId"].Should().Be(organId);
    }

    [Fact]
    public async Task Gestor_WithRolesClaimAsJsonArray_ShouldResolvePublicOrganId()
    {
        // A Lambda pre-token do Cognito emite o "roles" claim como JSON array
        // stringified (mesmo padrão do clinicIds). IsGestorPublico precisa
        // parsear isso, não só o CSV legado.
        var organId = Guid.NewGuid();

        var context = BuildContext(new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, Guid.NewGuid().ToString()),
            new Claim("roles", JsonSerializer.Serialize(new[] { "Medico", "GestorPublico" })),
            new Claim("publicOrganId", organId.ToString()),
        });

        await CreateMiddleware().InvokeAsync(context);

        context.Items["CurrentPublicOrganId"].Should().Be(organId);
    }
}
