namespace PlantonHub.Application.DTOs.Clinics;

public class UpdateClinicRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public bool IsActive { get; set; } = true;

    // Geolocation
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? AllowedRadiusMeters { get; set; }

    // Unit details
    public int? Capacity { get; set; }
    public int? DoctorsPerShift { get; set; }
    public bool HasNursing { get; set; } = false;

    // Address breakdown
    public string? City { get; set; }
    public string? Neighborhood { get; set; }
    public string? ZipCode { get; set; }
    public Guid? ContractId { get; set; }
}
