namespace PlantonHub.Application.DTOs.Clinics;

public class NearestClinicResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    /// <summary>
    /// Distance in meters from the provided coordinates.
    /// </summary>
    public double DistanceMeters { get; set; }

    /// <summary>
    /// Whether the user is within the allowed radius for check-in.
    /// </summary>
    public bool WithinRadius { get; set; }
}
