using PlantonHub.Application.Constants;

namespace PlantonHub.Infrastructure.Cache;

/// <summary>
/// Proxy class that delegates to PlantonHub.Application.Constants.CacheKeys.
/// Maintained for backward compatibility with existing Infrastructure usages.
/// </summary>
public static class CacheKeys
{
    public static void SetPrefix(string prefix) => Application.Constants.CacheKeys.SetPrefix(prefix);

    public static string Clinics(Guid clinicId) => Application.Constants.CacheKeys.Clinics(clinicId);

    public static string ClinicsAll() => Application.Constants.CacheKeys.ClinicsAll();

    public static string Shifts(Guid clinicId) => Application.Constants.CacheKeys.Shifts(clinicId);

    public static string ShiftsUser(Guid clinicId, Guid userId) => Application.Constants.CacheKeys.ShiftsUser(clinicId, userId);

    public static string UserProfile(Guid userId) => Application.Constants.CacheKeys.UserProfile(userId);

    public static string TokenBlacklist(string jti) => Application.Constants.CacheKeys.TokenBlacklist(jti);
}
