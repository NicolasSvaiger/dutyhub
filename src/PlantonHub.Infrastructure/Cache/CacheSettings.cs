namespace PlantonHub.Infrastructure.Cache;

public class CacheSettings
{
    public string InstancePrefix { get; set; } = "plantonhub:";
    public int DefaultTtlMinutes { get; set; } = 5;
}
