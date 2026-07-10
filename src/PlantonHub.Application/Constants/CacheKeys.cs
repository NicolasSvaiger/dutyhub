namespace PlantonHub.Application.Constants;

public static class CacheKeys
{
    public static string Clinics(Guid clinicId) => $"clinics:tenant:{clinicId}";

    public static string ClinicsAll() => "clinics:all";

    public static string ClinicsForUser(Guid userId) => $"clinics:user:{userId}";

    public static string Shifts(Guid clinicId) => $"shifts:tenant:{clinicId}";

    public static string ShiftsUser(Guid clinicId, Guid userId) => $"shifts:tenant:{clinicId}:user:{userId}";

    public static string UserProfile(Guid userId) => $"users:profile:{userId}";

    public static string TokenBlacklist(string jti) => $"blacklist:{jti}";
}
