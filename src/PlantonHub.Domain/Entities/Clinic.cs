namespace PlantonHub.Domain.Entities;

public class Clinic
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// GPS latitude of the clinic location (used for geofencing validation).
    /// </summary>
    public double? Latitude { get; set; }

    /// <summary>
    /// GPS longitude of the clinic location (used for geofencing validation).
    /// </summary>
    public double? Longitude { get; set; }

    /// <summary>
    /// Maximum allowed radius in meters for attendance events.
    /// If null, defaults to 500 meters during validation.
    /// </summary>
    public double? AllowedRadiusMeters { get; set; }

    /// <summary>
    /// Whether this clinic uses nursing staff (shows separate schedule grid).
    /// </summary>
    public bool HasNursing { get; set; } = false;

    /// <summary>Total bed capacity of the unit.</summary>
    public int? Capacity { get; set; }

    /// <summary>Target number of doctors per shift.</summary>
    public int? DoctorsPerShift { get; set; }

    /// <summary>City where the unit is located.</summary>
    public string? City { get; set; }

    /// <summary>Neighborhood / district.</summary>
    public string? Neighborhood { get; set; }

    /// <summary>Brazilian postal code (CEP), digits only or formatted.</summary>
    public string? ZipCode { get; set; }

    /// <summary>
    /// Contract that covers this clinic.
    /// Null means the clinic is not yet linked to any contract.
    /// </summary>
    public Guid? ContractId { get; set; }
    public Contract? Contract { get; set; }

    /// <summary>
    /// Check-in tolerance in minutes for this specific clinic.
    /// If null, the global system tolerance (SystemSettings.CheckInToleranceMinutes) applies.
    /// </summary>
    public int? CheckInToleranceMinutes { get; set; }

    // Navigation properties
    public ICollection<UserClinicRole> UserClinicRoles { get; set; } = new List<UserClinicRole>();
    public ICollection<Shift> Shifts { get; set; } = new List<Shift>();
    public ICollection<Attendance> Attendances { get; set; } = new List<Attendance>();
    public ICollection<ClinicShiftTemplate> ShiftTemplates { get; set; } = new List<ClinicShiftTemplate>();
}
