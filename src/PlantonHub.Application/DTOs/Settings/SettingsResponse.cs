namespace PlantonHub.Application.DTOs.Settings;

public class ClinicToleranceDto
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public int? CheckInToleranceMinutes { get; set; }
}

public class SettingsResponse
{
    // Global tolerances
    public int CheckInToleranceMinutes { get; set; }
    public int AbsenceThresholdMinutes { get; set; }
    public int CheckInBlockAfterMinutes { get; set; }
    public bool NotifyOnAbsence { get; set; }

    // Per-clinic overrides
    public List<ClinicToleranceDto> ClinicTolerances { get; set; } = new();
}
