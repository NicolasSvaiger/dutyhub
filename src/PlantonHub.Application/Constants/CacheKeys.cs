namespace PlantonHub.Application.Constants;

public static class CacheKeys
{
    private static string _prefix = "plantonhub";

    public static void SetPrefix(string prefix) => _prefix = prefix;

    public static string Clinics(Guid clinicId) => $"{_prefix}:clinics:tenant:{clinicId}";

    public static string ClinicsAll() => $"{_prefix}:clinics:all";

    public static string Shifts(Guid clinicId) => $"{_prefix}:shifts:tenant:{clinicId}";

    public static string ShiftsUser(Guid clinicId, Guid userId) => $"{_prefix}:shifts:tenant:{clinicId}:user:{userId}";

    public static string UserProfile(Guid userId) => $"{_prefix}:users:profile:{userId}";

    public static string TokenBlacklist(string jti) => $"{_prefix}:blacklist:{jti}";
}
