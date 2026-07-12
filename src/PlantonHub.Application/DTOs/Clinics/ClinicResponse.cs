namespace PlantonHub.Application.DTOs.Clinics;

public class ShiftTemplateResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public int RequiredStaff { get; set; }
    public int DisplayOrder { get; set; }
    public string ProfessionalType { get; set; } = "Medico"; // "Medico" or "Enfermeiro"
}

public class ClinicResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public bool IsActive { get; set; }
    public bool HasNursing { get; set; }
    public DateTime CreatedAt { get; set; }

    // Geolocation
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? AllowedRadiusMeters { get; set; }

    // Unit details
    public int? Capacity { get; set; }
    public int? DoctorsPerShift { get; set; }

    // Address breakdown
    public string? City { get; set; }
    public string? Neighborhood { get; set; }
    public string? ZipCode { get; set; }
    public Guid? ContractId { get; set; }

    public List<ShiftTemplateResponse> ShiftTemplates { get; set; } = new();
}
