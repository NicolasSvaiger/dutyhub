using System.Security.Cryptography;
using System.Text;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.Infrastructure.Services;

/// <summary>
/// Authenticates users via Cognito CUSTOM_AUTH flow.
/// 
/// Flow:
/// 1. Backend calls AdminInitiateAuth with CUSTOM_AUTH + USERNAME
/// 2. Cognito returns a CUSTOM_CHALLENGE with a nonce in challengeParameters
/// 3. Backend computes HMAC-SHA256(nonce, CUSTOM_AUTH_SECRET) and responds
/// 4. Cognito's VerifyAuthChallenge Lambda validates the HMAC
/// 5. Tokens are issued
///
/// This eliminates the shared service password — no per-user passwords stored anywhere.
/// The CUSTOM_AUTH_SECRET is shared only between the backend and the CreateAuthChallenge Lambda
/// (both read it from Secrets Manager / env var).
/// </summary>
public class CognitoAuthService : ICognitoAuthService
{
    private readonly string _userPoolId;
    private readonly string _backendClientId;
    private readonly string _region;
    private readonly string _customAuthSecret;
    private readonly ILogger<CognitoAuthService> _logger;

    public CognitoAuthService(IConfiguration configuration, ILogger<CognitoAuthService> logger)
    {
        _userPoolId = configuration["Cognito:UserPoolId"]
            ?? throw new InvalidOperationException("Cognito:UserPoolId not configured");
        _backendClientId = configuration["Cognito:BackendClientId"]
            ?? configuration["Cognito:ClientId"]
            ?? throw new InvalidOperationException("Cognito:BackendClientId not configured");
        _region = configuration["Cognito:Region"] ?? "us-east-1";
        _customAuthSecret = configuration["Cognito:CustomAuthSecret"]
            ?? throw new InvalidOperationException("Cognito:CustomAuthSecret not configured");
        _logger = logger;
    }

    public async Task<CognitoAuthResult> AuthenticateAsync(string email)
    {
        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        try
        {
            // Step 1: Initiate CUSTOM_AUTH flow
            var initiateRequest = new AdminInitiateAuthRequest
            {
                UserPoolId = _userPoolId,
                ClientId = _backendClientId,
                AuthFlow = AuthFlowType.CUSTOM_AUTH,
                AuthParameters = new Dictionary<string, string>
                {
                    { "USERNAME", email },
                },
            };

            var initiateResponse = await client.AdminInitiateAuthAsync(initiateRequest);

            // Step 2: Expect a CUSTOM_CHALLENGE with a nonce
            if (initiateResponse.ChallengeName != ChallengeNameType.CUSTOM_CHALLENGE)
            {
                _logger.LogError(
                    "Unexpected challenge type from Cognito: {Challenge} for {Email}",
                    initiateResponse.ChallengeName, email);
                throw new UnauthorizedAccessException("Authentication failed — unexpected challenge.");
            }

            var nonce = initiateResponse.ChallengeParameters["nonce"];
            if (string.IsNullOrEmpty(nonce))
            {
                throw new UnauthorizedAccessException("Authentication failed — no challenge nonce.");
            }

            // Step 3: Compute HMAC-SHA256(nonce, secret) as the challenge answer
            var answer = ComputeHmac(nonce, _customAuthSecret);

            // Step 4: Respond to the challenge
            var respondRequest = new AdminRespondToAuthChallengeRequest
            {
                UserPoolId = _userPoolId,
                ClientId = _backendClientId,
                ChallengeName = ChallengeNameType.CUSTOM_CHALLENGE,
                Session = initiateResponse.Session,
                ChallengeResponses = new Dictionary<string, string>
                {
                    { "USERNAME", email },
                    { "ANSWER", answer },
                },
            };

            var respondResponse = await client.AdminRespondToAuthChallengeAsync(respondRequest);

            // Step 5: Tokens issued
            return new CognitoAuthResult(
                respondResponse.AuthenticationResult.IdToken,
                respondResponse.AuthenticationResult.AccessToken,
                respondResponse.AuthenticationResult.RefreshToken,
                respondResponse.AuthenticationResult.ExpiresIn
            );
        }
        catch (NotAuthorizedException ex)
        {
            _logger.LogWarning("Cognito custom auth failed for {Email}: {Message}", email, ex.Message);
            throw new UnauthorizedAccessException("Authentication failed.");
        }
        catch (UserNotFoundException ex)
        {
            _logger.LogWarning("Cognito user not found: {Email}: {Message}", email, ex.Message);
            throw new UnauthorizedAccessException("User not found.");
        }
    }

    public async Task EnsureUserExistsAsync(string email)
    {
        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        try
        {
            // Check if user already exists
            await client.AdminGetUserAsync(new AdminGetUserRequest
            {
                UserPoolId = _userPoolId,
                Username = email,
            });

            _logger.LogDebug("Cognito user already exists: {Email}", email);
        }
        catch (UserNotFoundException)
        {
            // Create the user without a password (CUSTOM_AUTH doesn't need one)
            await client.AdminCreateUserAsync(new AdminCreateUserRequest
            {
                UserPoolId = _userPoolId,
                Username = email,
                UserAttributes = new List<AttributeType>
                {
                    new() { Name = "email", Value = email },
                    new() { Name = "email_verified", Value = "true" },
                },
                MessageAction = MessageActionType.SUPPRESS, // Don't send welcome email
            });

            _logger.LogInformation("Created Cognito user for professional: {Email}", email);
        }
    }

    public async Task CreateInvitedUserAsync(string email, string name)
    {
        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        // Idempotência: se o user já existe, retorna sem enviar novo convite
        // pra evitar spam de emails em retries do fluxo administrativo.
        try
        {
            await client.AdminGetUserAsync(new AdminGetUserRequest
            {
                UserPoolId = _userPoolId,
                Username = email,
            });
            _logger.LogInformation("Cognito user already exists for invite: {Email}", email);
            return;
        }
        catch (UserNotFoundException)
        {
            // Continua pro create — o path esperado no fluxo administrativo
            // é criar um novo user.
        }

        // Senha temp aleatória — o Cognito exige senha temporária no fluxo
        // com email invite. O user é obrigado a trocar no primeiro login
        // (challenge NEW_PASSWORD_REQUIRED). A senha em si nunca é usada
        // depois desse primeiro acesso.
        var temporaryPassword = GenerateTemporaryPassword();

        try
        {
            await client.AdminCreateUserAsync(new AdminCreateUserRequest
            {
                UserPoolId = _userPoolId,
                Username = email,
                TemporaryPassword = temporaryPassword,
                UserAttributes = new List<AttributeType>
                {
                    new() { Name = "email", Value = email },
                    new() { Name = "email_verified", Value = "true" },
                    new() { Name = "name", Value = name },
                },
                // MessageAction default (não SUPPRESS) → Cognito envia
                // o email de convite com a senha temporária. O template
                // é configurável no console Cognito.
                DesiredDeliveryMediums = new List<string> { "EMAIL" },
            });

            _logger.LogInformation("Created Cognito user with invite: {Email}", email);
        }
        catch (UsernameExistsException)
        {
            // Race condition: outro thread criou entre o AdminGetUser e o
            // AdminCreateUser. Idempotência mantida — trata como sucesso.
            _logger.LogInformation("Cognito user was created concurrently: {Email}", email);
        }
    }

    public async Task DeleteUserAsync(string email)
    {
        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        try
        {
            await client.AdminDeleteUserAsync(new AdminDeleteUserRequest
            {
                UserPoolId = _userPoolId,
                Username = email,
            });
            _logger.LogInformation("Deleted Cognito user: {Email}", email);
        }
        catch (UserNotFoundException)
        {
            // Idempotente — se o user já não existe, o objetivo já foi
            // alcançado. Usado como compensating action no rollback do
            // GestorService.CreateAsync quando o DB falha após o Cognito.
            _logger.LogDebug("Cognito user already absent on delete: {Email}", email);
        }
    }

    public async Task UpdateEmailAsync(string oldEmail, string newEmail)
    {
        if (string.Equals(oldEmail, newEmail, StringComparison.OrdinalIgnoreCase))
        {
            return; // nada a fazer — evita round-trip ao Cognito sem necessidade
        }

        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        try
        {
            await client.AdminUpdateUserAttributesAsync(new AdminUpdateUserAttributesRequest
            {
                UserPoolId = _userPoolId,
                Username = oldEmail,
                UserAttributes = new List<AttributeType>
                {
                    new() { Name = "email", Value = newEmail },
                    // email_verified precisa ser reafirmado — o Cognito zera
                    // essa flag quando o atributo email muda via admin API,
                    // e um email não-verificado bloqueia login com alias.
                    new() { Name = "email_verified", Value = "true" },
                },
            });
            _logger.LogInformation("Updated Cognito email: {OldEmail} -> {NewEmail}", oldEmail, newEmail);
        }
        catch (UserNotFoundException)
        {
            // Usuário não existe no Cognito (ex.: seed local sem migração).
            // Não bloqueia a atualização no Postgres — loga e segue.
            _logger.LogWarning("Cognito user not found for email update: {OldEmail}", oldEmail);
        }
    }

    public async Task<bool> IsInvitePendingAsync(string email)
    {
        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        try
        {
            var response = await client.AdminGetUserAsync(new AdminGetUserRequest
            {
                UserPoolId = _userPoolId,
                Username = email,
            });

            // FORCE_CHANGE_PASSWORD = criado com senha temp e nunca
            // completou o 1º login (troca de senha). É o sinal exato de
            // "convite não aceito".
            return response.UserStatus == UserStatusType.FORCE_CHANGE_PASSWORD;
        }
        catch (UserNotFoundException)
        {
            // Sem usuário no Cognito não há convite pra estar pendente
            // (ex.: seed local sem migração). Trata como não-pendente.
            return false;
        }
    }

    public async Task<IReadOnlyDictionary<string, bool>> GetInvitePendingMapAsync(IEnumerable<string> emails)
    {
        var wanted = emails
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim().ToLowerInvariant())
            .ToHashSet();

        var map = new Dictionary<string, bool>();
        if (wanted.Count == 0)
        {
            return map;
        }

        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        // Pagina o pool inteiro uma vez e cruza com os emails pedidos.
        // Barato pra escala atual (dezenas/poucas centenas de usuários) e
        // evita N chamadas AdminGetUser. Um teto de páginas protege contra
        // um pool inesperadamente grande — no pior caso alguns usuários
        // ficam de fora do mapa e são tratados como não-pendentes.
        const int maxPages = 50; // 50 * 60 = 3000 usuários
        string? paginationToken = null;
        var pages = 0;

        do
        {
            var response = await client.ListUsersAsync(new ListUsersRequest
            {
                UserPoolId = _userPoolId,
                Limit = 60,
                PaginationToken = paginationToken,
                AttributesToGet = new List<string> { "email" },
            });

            foreach (var user in response.Users)
            {
                var emailAttr = user.Attributes
                    .FirstOrDefault(a => a.Name == "email")?.Value
                    ?.Trim().ToLowerInvariant();

                if (emailAttr is null || !wanted.Contains(emailAttr))
                {
                    continue;
                }

                map[emailAttr] = user.UserStatus == UserStatusType.FORCE_CHANGE_PASSWORD;
            }

            paginationToken = response.PaginationToken;
            pages++;
        }
        while (!string.IsNullOrEmpty(paginationToken) && pages < maxPages && map.Count < wanted.Count);

        return map;
    }

    public async Task ResendInviteAsync(string email)
    {
        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        try
        {
            await client.AdminCreateUserAsync(new AdminCreateUserRequest
            {
                UserPoolId = _userPoolId,
                Username = email,
                // RESEND reenvia o convite e reseta a expiração da senha
                // temporária. Só é válido enquanto o usuário está em
                // FORCE_CHANGE_PASSWORD (ainda não aceitou).
                MessageAction = MessageActionType.RESEND,
                DesiredDeliveryMediums = new List<string> { "EMAIL" },
            });

            _logger.LogInformation("Resent Cognito invite: {Email}", email);
        }
        catch (UnsupportedUserStateException)
        {
            // Usuário já aceitou o convite (CONFIRMED) — reenvio não faz
            // sentido. Traduz pra 409 na API.
            throw new ConflictException("O usuário já aceitou o convite; não é possível reenviar.");
        }
        catch (UserNotFoundException)
        {
            throw new NotFoundException($"Usuário '{email}' não encontrado no provedor de identidade.");
        }
    }

    /// <summary>
    /// Gera senha temporária que satisfaz a policy padrão do Cognito
    /// (min 8, upper, lower, digit, symbol). A senha é usada uma única
    /// vez e trocada no primeiro login via challenge NEW_PASSWORD_REQUIRED.
    /// Combinamos entropia criptográfica com garantia dos requisitos.
    /// </summary>
    private static string GenerateTemporaryPassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I, O pra reduzir confusão visual
        const string lower = "abcdefghijkmnpqrstuvwxyz"; // sem l, o
        const string digits = "23456789";                 // sem 0, 1
        const string symbols = "!@#$%&*?";
        const string all = upper + lower + digits + symbols;

        var buffer = new char[16];
        // Garante pelo menos 1 de cada categoria — Cognito rejeita senha
        // sem cada componente. Os 4 primeiros índices são "reservados";
        // depois embaralhamos.
        buffer[0] = upper[RandomNumberGenerator.GetInt32(upper.Length)];
        buffer[1] = lower[RandomNumberGenerator.GetInt32(lower.Length)];
        buffer[2] = digits[RandomNumberGenerator.GetInt32(digits.Length)];
        buffer[3] = symbols[RandomNumberGenerator.GetInt32(symbols.Length)];
        for (var i = 4; i < buffer.Length; i++)
        {
            buffer[i] = all[RandomNumberGenerator.GetInt32(all.Length)];
        }

        // Fisher-Yates shuffle com RNG criptográfica
        for (var i = buffer.Length - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (buffer[i], buffer[j]) = (buffer[j], buffer[i]);
        }

        return new string(buffer);
    }

    /// <summary>
    /// Compute HMAC-SHA256 of the nonce using the shared secret.
    /// This proves to Cognito's VerifyAuthChallenge Lambda that we are the legitimate backend.
    /// </summary>
    private static string ComputeHmac(string nonce, string secret)
    {
        var keyBytes = Encoding.UTF8.GetBytes(secret);
        var dataBytes = Encoding.UTF8.GetBytes(nonce);

        using var hmac = new HMACSHA256(keyBytes);
        var hash = hmac.ComputeHash(dataBytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
