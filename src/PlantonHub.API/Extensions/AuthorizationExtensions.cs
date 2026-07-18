using System.Text.Json;

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

            // Gestor público (Prefeitura). Perfil paralelo, não subordinado
            // ao AdminGlobal — um AdminGlobal que quer ver dados de Prefeitura
            // consulta via Admin OS (que já tem endpoints agregados). O portal
            // /prefeitura só aceita esse role.
            options.AddPolicy("GestorPublico", policy =>
                policy.RequireAssertion(context => HasRole(context, "GestorPublico")));
        });

        return services;
    }

    /// <summary>
    /// Checks if the user has the specified role.
    /// Supports multiple claim sources:
    ///   - "roles" (custom claim from pre-token-generation Lambda, JSON array or CSV)
    ///   - "cognito:groups" (Cognito native groups)
    ///
    /// Matches by equality (case-insensitive) — never substring — to prevent
    /// bypass when a role name is a substring of another (e.g. "Admin" vs "AdminGlobal").
    /// </summary>
    private static bool HasRole(Microsoft.AspNetCore.Authorization.AuthorizationHandlerContext context, string role)
    {
        var user = context.User;

        // Source 1: "roles" custom claim — parse JSON array or CSV, then compare by equality.
        var rolesClaim = user.FindFirst("roles")?.Value;
        if (!string.IsNullOrEmpty(rolesClaim))
        {
            foreach (var parsed in ParseRolesClaim(rolesClaim))
            {
                if (string.Equals(parsed, role, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
        }

        // Source 2: "cognito:groups" claims — one claim per group, exact match.
        if (user.HasClaim(c => c.Type == "cognito:groups" &&
                                string.Equals(c.Value, role, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return false;
    }

    private static IEnumerable<string> ParseRolesClaim(string rolesClaim)
    {
        var raw = rolesClaim.Trim();

        // JSON array: ["AdminGlobal","Medico"]
        if (raw.StartsWith('['))
        {
            string[]? parsed = null;
            try { parsed = JsonSerializer.Deserialize<string[]>(raw); }
            catch { /* fall through to CSV */ }

            if (parsed is not null)
            {
                foreach (var r in parsed)
                {
                    if (!string.IsNullOrWhiteSpace(r)) yield return r.Trim();
                }
                yield break;
            }
        }

        // CSV: "AdminGlobal,Medico"
        foreach (var r in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            yield return r;
        }
    }
}
