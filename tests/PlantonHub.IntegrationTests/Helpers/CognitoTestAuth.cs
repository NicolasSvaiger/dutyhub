using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;

namespace PlantonHub.IntegrationTests.Helpers;

/// <summary>
/// Helper para autenticar nos testes de integração via Cognito real.
/// Usa AdminInitiateAuth (USER_PASSWORD_AUTH) — mesmo fluxo que o frontend
/// faz via SDK, mas server-side pra não depender do browser.
///
/// Requer:
///   - AWS credentials configuradas (via env/profile — CI usa IAM role)
///   - Variáveis de ambiente: COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID
///   - Usuário já criado no User Pool (medico@plantonhub.com / Teste@123)
/// </summary>
public static class CognitoTestAuth
{
    private static readonly string UserPoolId =
        Environment.GetEnvironmentVariable("COGNITO_USER_POOL_ID") ?? "us-east-1_0PARyV1xj";

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

        var request = new AdminInitiateAuthRequest
        {
            UserPoolId = UserPoolId,
            ClientId = ClientId,
            AuthFlow = AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
            AuthParameters = new Dictionary<string, string>
            {
                { "USERNAME", email },
                { "PASSWORD", password },
            },
        };

        var response = await client.AdminInitiateAuthAsync(request);

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
}
