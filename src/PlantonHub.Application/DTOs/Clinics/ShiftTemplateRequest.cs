namespace PlantonHub.Application.DTOs.Clinics;

public class UpsertShiftTemplatesRequest
{
    /// <summary>
    /// Full list of shift templates to set for the clinic.
    /// Replaces all existing templates in a single operation.
    /// </summary>
    public List<ShiftTemplateItem> Templates { get; set; } = new();
}

public class ShiftTemplateItem
{
    public string Name { get; set; } = string.Empty;       // "Manhã", "Tarde", "Noite"
    public string StartTime { get; set; } = string.Empty;  // "07:00:00"
    public string EndTime { get; set; } = string.Empty;    // "19:00:00"
    public int RequiredStaff { get; set; } = 1;
    public int DisplayOrder { get; set; }
    public int ProfessionalType { get; set; } = 1;         // 1=Medico, 2=Enfermeiro
}
