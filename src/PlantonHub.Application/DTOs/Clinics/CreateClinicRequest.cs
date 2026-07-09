namespace PlantonHub.Application.DTOs.Clinics;

public class CreateClinicRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Phone { get; set; }
}
