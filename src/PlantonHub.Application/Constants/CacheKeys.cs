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

    // ─────────────────────────────────────────────────────────────
    // Portal Prefeitura — reads agregados por organ (Sprint 7B).
    // TTLs curtos (15-60s) absorvem rajadas sem invalidação cirúrgica
    // (design.md § "Cache strategy"). Prefixo dedicado evita colisão
    // com "clinics:", "shifts:" etc.
    // ─────────────────────────────────────────────────────────────

    public static string PrefeituraOrganScope(Guid organId) => $"prefeitura:scope:{organId}";

    public static string PrefeituraDashboard(Guid organId) => $"prefeitura:dashboard:{organId}";

    public static string PrefeituraKpis(Guid organId, DateTime from, DateTime to) =>
        $"prefeitura:kpis:{organId}:{from:yyyyMMdd}:{to:yyyyMMdd}";

    public static string PrefeituraClinics(Guid organId) => $"prefeitura:clinics:{organId}";

    public static string PrefeituraFrequency(Guid organId, DateTime from, DateTime to, Guid? clinicId) =>
        $"prefeitura:frequency:{organId}:{from:yyyyMMdd}:{to:yyyyMMdd}:{clinicId?.ToString() ?? "all"}";

    public static string PrefeituraAbsences(Guid organId, DateTime from, DateTime to, string? type) =>
        $"prefeitura:absences:{organId}:{from:yyyyMMdd}:{to:yyyyMMdd}:{type ?? "all"}";

    public static string PrefeituraRealtime(Guid organId) => $"prefeitura:realtime:{organId}";
}
