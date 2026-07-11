namespace PlantonHub.API.Extensions;

public static class AuthorizationExtensions
{
    public static IServiceCollection AddAuthorizationPolicies(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.AddPolicy("AdminGlobal", policy =>
                policy.RequireAssertion(context => HasRole(context, "AdminGlobal")));

            options.AddPolicy("AdminClinica", policy =>
                policy.RequireAssertion(context =>
                    HasRole(context, "AdminGlobal") || HasRole(context, "AdminClinica")));

            options.AddPolicy("Profissional", policy =>
                policy.RequireAssertion(context =>
                    HasRole(context, "Medico") || HasRole(context, "Enfermeiro") || HasRole(context, "Tecnico")));
        });

        return services;
    }

    /// <summary>
    /// Checks if the user has the specified role.
    /// Supports multiple claim sources:
    ///   - "roles" (custom claim from pre-token-generation Lambda, comma-separated or JSON)
    ///   - "cognito:groups" (Cognito native groups)
    /// </summary>
    private static bool HasRole(Microsoft.AspNetCore.Authorization.AuthorizationHandlerContext context, string role)
    {
        var user = context.User;

        // Check "roles" claim (custom, from Lambda — can be comma-separated or JSON array)
        var rolesClaim = user.FindFirst("roles")?.Value;
        if (!string.IsNullOrEmpty(rolesClaim) && rolesClaim.Contains(role))
        {
            return true;
        }

        // Check "cognito:groups" claims (Cognito native — one claim per group)
        if (user.HasClaim(c => c.Type == "cognito:groups" && c.Value == role))
        {
            return true;
        }

        return false;
    }
}
