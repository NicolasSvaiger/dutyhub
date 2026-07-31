using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;

namespace PlantonHub.IntegrationTests.Helpers;

/// <summary>
/// Helper para autenticar nos testes de integração via Cognito real.
/// Usa InitiateAuth (USER_PASSWORD_AUTH) — mesmo fluxo de senha que o
/// frontend faz via SDK, server-side pra não depender do browser.
///
/// Importante: o SPA client (dutyhub-spa) habilita ALLOW_USER_PASSWORD_AUTH
/// e não tem secret, então InitiateAuth (não-admin) basta. AdminInitiateAuth
/// exigiria ADMIN_USER_PASSWORD_AUTH, que só o backend client tem (e esse
/// tem secret) — por isso o fluxo admin dava "Auth flow not enabled".
///
/// Requer:
///   - Variável de ambiente COGNITO_CLIENT_ID (SPA client, sem secret)
///   - Usuário já criado no User Pool (medico@plantonhub.com / Teste@123)
/// </summary>
public static class CognitoTestAuth
{
    private static readonly string ClientId =
        Environment.GetEnvironmentVariable("COGNITO_CLIENT_ID") ?? "3g1hnk76ksd3cbt8aqlio0bb87";

    private static readonly string Region =
        Environment.GetEnvironmentVariable("COGNITO_REGION") ?? "us-east-1";

    /// <summary>
    /// Autentica um usuário no Cognito e retorna o access token (JWT).
    /// </summary>
    public static async Task<string> GetAccessTokenAsync(string email, string password)
    {
        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(Region));

        var request = new InitiateAuthRequest
        {
            ClientId = ClientId,
            AuthFlow = AuthFlowType.USER_PASSWORD_AUTH,
            AuthParameters = new Dictionary<string, string>
            {
                { "USERNAME", email },
                { "PASSWORD", password },
            },
        };

        var response = await client.InitiateAuthAsync(request);

        if (response.ChallengeName == ChallengeNameType.NEW_PASSWORD_REQUIRED)
        {
            throw new InvalidOperationException(
                $"User '{email}' requires password change. Run the migration script with --set-permanent-password first.");
        }

        return response.AuthenticationResult.IdToken;
    }

    /// <summary>
    /// Autentica o médico padrão de teste (medico@plantonhub.com / Teste@123).
    /// </summary>
    public static Task<string> GetMedicoTokenAsync()
        => GetAccessTokenAsync("medico@plantonhub.com", "Teste@123");

    /// <summary>
    /// Autentica o admin global de teste (admin@plantonhub.com / Admin@123).
    /// </summary>
    public static Task<string> GetAdminTokenAsync()
        => GetAccessTokenAsync("admin@plantonhub.com", "Admin@123");

    /// <summary>
    /// Autentica o gestor público (Prefeitura) de teste
    /// (gestor@plantonhub.com / Teste@123). O usuário precisa estar no grupo
    /// <c>GestorPublico</c> do Cognito e ter <c>UserPublicOrganRole</c>
    /// registrado no RDS. Sprint 7A criou o grupo via CDK e o seed.
    /// </summary>
    public static Task<string> GetGestorTokenAsync()
        => GetAccessTokenAsync("gestor@plantonhub.com", "Teste@123");
}
