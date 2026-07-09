namespace PlantonHub.API.Extensions;

public static class AuthorizationExtensions
{
    public static IServiceCollection AddAuthorizationPolicies(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.AddPolicy("AdminGlobal", policy =>
                policy.RequireAssertion(context =>
                    context.User.HasClaim(c => c.Type == "roles" && c.Value.Contains("AdminGlobal"))));

            options.AddPolicy("AdminClinica", policy =>
                policy.RequireAssertion(context =>
                    context.User.HasClaim(c => c.Type == "roles" &&
                        (c.Value.Contains("AdminGlobal") || c.Value.Contains("AdminClinica")))));

            options.AddPolicy("Profissional", policy =>
                policy.RequireAssertion(context =>
                    context.User.HasClaim(c => c.Type == "roles" &&
                        (c.Value.Contains("Medico") || c.Value.Contains("Enfermeiro") || c.Value.Contains("Tecnico")))));
        });

        return services;
    }
}
