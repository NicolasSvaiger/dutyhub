using System.Security.Claims;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PlantonHub.API.Extensions;

namespace PlantonHub.UnitTests.Extensions;

/// <summary>
/// Sprint 7A — valida a policy <c>GestorPublico</c> registrada em
/// <see cref="AuthorizationExtensions.AddAuthorizationPolicies"/>. A policy
/// é paralela às demais (AdminGlobal, AdminClinica, Profissional) — não
/// composta — então não deve autorizar admin nem profissional clínico.
/// </summary>
public class AuthorizationExtensionsTests
{
    /// <summary>
    /// Monta um <see cref="IAuthorizationService"/> real com as políticas
    /// reais registradas — a intenção é validar exatamente o comportamento
    /// que roda em produção, não uma reimplementação.
    /// </summary>
    private static IAuthorizationService BuildAuthorizationService()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAuthorizationPolicies();
        return services.BuildServiceProvider().GetRequiredService<IAuthorizationService>();
    }

    private static ClaimsPrincipal BuildUser(params Claim[] claims)
    {
        var identity = new ClaimsIdentity(claims, "TestAuth");
        return new ClaimsPrincipal(identity);
    }

    [Fact]
    public async Task GestorPublicoPolicy_WithGestorPublicoRoleClaim_ShouldSucceed()
    {
        var auth = BuildAuthorizationService();
        var user = BuildUser(new Claim("roles", "GestorPublico"));

        var result = await auth.AuthorizeAsync(user, resource: null, "GestorPublico");

        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task GestorPublicoPolicy_WithRolesClaimAsJsonArray_ShouldSucceed()
    {
        // Lambda pre-token do Cognito emite roles como JSON stringified.
        var auth = BuildAuthorizationService();
        var user = BuildUser(new Claim(
            "roles",
            JsonSerializer.Serialize(new[] { "Medico", "GestorPublico" })));

        var result = await auth.AuthorizeAsync(user, resource: null, "GestorPublico");

        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task GestorPublicoPolicy_WithCognitoGroupsClaim_ShouldSucceed()
    {
        // Path "somente Cognito", sem a Lambda emitir roles custom.
        var auth = BuildAuthorizationService();
        var user = BuildUser(new Claim("cognito:groups", "GestorPublico"));

        var result = await auth.AuthorizeAsync(user, resource: null, "GestorPublico");

        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task GestorPublicoPolicy_WithMedicoRole_ShouldFail()
    {
        var auth = BuildAuthorizationService();
        var user = BuildUser(new Claim("roles", "Medico"));

        var result = await auth.AuthorizeAsync(user, resource: null, "GestorPublico");

        result.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task GestorPublicoPolicy_WithAdminGlobalRole_ShouldFail()
    {
        // Decisão de design: AdminGlobal não herda GestorPublico. Quem quer
        // ver Prefeitura entra via /admin/os (que já tem os endpoints
        // agregados), não pelo portal /prefeitura.
        var auth = BuildAuthorizationService();
        var user = BuildUser(new Claim("roles", "AdminGlobal"));

        var result = await auth.AuthorizeAsync(user, resource: null, "GestorPublico");

        result.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task GestorPublicoPolicy_WithNoRolesAtAll_ShouldFail()
    {
        var auth = BuildAuthorizationService();
        var user = BuildUser(new Claim("sub", Guid.NewGuid().ToString()));

        var result = await auth.AuthorizeAsync(user, resource: null, "GestorPublico");

        result.Succeeded.Should().BeFalse();
    }
}
