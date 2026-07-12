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
    public List<ShiftTemplateResponse> ShiftTemplates { get; set; } = new();
}
