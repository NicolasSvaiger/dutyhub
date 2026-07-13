namespace PlantonHub.Application.DTOs.Settings;

public class ClinicToleranceUpdate
{
    public Guid ClinicId { get; set; }
    public int? CheckInToleranceMinutes { get; set; }
}

public class UpdateSettingsRequest
{
    // Global tolerances
    public int CheckInToleranceMinutes { get; set; } = 15;
    public int AbsenceThresholdMinutes { get; set; } = 60;
    public int CheckInBlockAfterMinutes { get; set; } = 120;
    public bool NotifyOnAbsence { get; set; } = true;

    // Per-clinic overrides (empty = don't change)
    public List<ClinicToleranceUpdate> ClinicTolerances { get; set; } = new();
}
