using System.Security.Cryptography;
using System.Text;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
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
