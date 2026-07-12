using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PlantonHub.Application.Interfaces;

namespace PlantonHub.Infrastructure.Services;

/// <summary>
/// Authenticates users via Cognito AdminInitiateAuth using CUSTOM_AUTH flow.
/// The face verification acts as the authentication factor — once verified,
/// this service issues tokens on behalf of the user.
///
/// Uses ALLOW_ADMIN_USER_PASSWORD_AUTH flow with a service-managed password.
/// The service password is set via AdminSetUserPassword and stored per-user in Cognito
/// as a custom attribute. The user never sees or types this password.
/// </summary>
public class CognitoAuthService : ICognitoAuthService
{
    private readonly string _userPoolId;
    private readonly string _clientId;
    private readonly string _region;
    private readonly string _servicePasswordSecret;
    private readonly ILogger<CognitoAuthService> _logger;

    public CognitoAuthService(IConfiguration configuration, ILogger<CognitoAuthService> logger)
    {
        _userPoolId = configuration["Cognito:UserPoolId"]
            ?? throw new InvalidOperationException("Cognito:UserPoolId not configured");
        _clientId = configuration["Cognito:ClientId"]
            ?? throw new InvalidOperationException("Cognito:ClientId not configured");
        _region = configuration["Cognito:Region"] ?? "us-east-1";
        // Service password used for face-login auth flow
        // This is a shared secret that only the backend knows — used with AdminInitiateAuth
        _servicePasswordSecret = configuration["Cognito:ServicePassword"]
            ?? throw new InvalidOperationException("Cognito:ServicePassword not configured");
        _logger = logger;
    }

    public async Task<CognitoAuthResult> AuthenticateAsync(string email)
    {
        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        try
        {
            var request = new AdminInitiateAuthRequest
            {
                UserPoolId = _userPoolId,
                ClientId = _clientId,
                AuthFlow = AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
                AuthParameters = new Dictionary<string, string>
                {
                    { "USERNAME", email },
                    { "PASSWORD", _servicePasswordSecret },
                },
            };

            var response = await client.AdminInitiateAuthAsync(request);

            if (response.ChallengeName == ChallengeNameType.NEW_PASSWORD_REQUIRED)
            {
                // Auto-complete the challenge with the same service password
                var challengeResponse = await client.AdminRespondToAuthChallengeAsync(
                    new AdminRespondToAuthChallengeRequest
                    {
                        UserPoolId = _userPoolId,
                        ClientId = _clientId,
                        ChallengeName = ChallengeNameType.NEW_PASSWORD_REQUIRED,
                        Session = response.Session,
                        ChallengeResponses = new Dictionary<string, string>
                        {
                            { "USERNAME", email },
                            { "NEW_PASSWORD", _servicePasswordSecret },
                        },
                    });

                return new CognitoAuthResult(
                    challengeResponse.AuthenticationResult.IdToken,
                    challengeResponse.AuthenticationResult.AccessToken,
                    challengeResponse.AuthenticationResult.RefreshToken,
                    challengeResponse.AuthenticationResult.ExpiresIn
                );
            }

            return new CognitoAuthResult(
                response.AuthenticationResult.IdToken,
                response.AuthenticationResult.AccessToken,
                response.AuthenticationResult.RefreshToken,
                response.AuthenticationResult.ExpiresIn
            );
        }
        catch (NotAuthorizedException ex)
        {
            _logger.LogWarning("Cognito auth failed for {Email}: {Message}", email, ex.Message);
            throw new UnauthorizedAccessException("Authentication failed.");
        }
        catch (UserNotFoundException ex)
        {
            _logger.LogWarning("Cognito user not found: {Email}: {Message}", email, ex.Message);
            throw new UnauthorizedAccessException("User not found.");
        }
    }

    public async Task SetServicePasswordAsync(string email)
    {
        using var client = new AmazonCognitoIdentityProviderClient(
            Amazon.RegionEndpoint.GetBySystemName(_region));

        try
        {
            await client.AdminSetUserPasswordAsync(new AdminSetUserPasswordRequest
            {
                UserPoolId = _userPoolId,
                Username = email,
                Password = _servicePasswordSecret,
                Permanent = true,
            });

            _logger.LogInformation("Service password set for professional: {Email}", email);
        }
        catch (UserNotFoundException ex)
        {
            _logger.LogWarning("Cannot set service password — user not found in Cognito: {Email}: {Message}", email, ex.Message);
            throw;
        }
    }
}
