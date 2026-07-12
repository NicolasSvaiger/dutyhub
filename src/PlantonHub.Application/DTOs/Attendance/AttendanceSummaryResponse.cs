namespace PlantonHub.Application.DTOs.Attendance;

/// <summary>
/// Aggregated attendance summary for a professional.
/// Used by the Flutter app's home/reports screen.
/// </summary>
public class AttendanceSummaryResponse
{
    /// <summary>
    /// Total distinct days with at least one check-in.
    /// </summary>
    public int TotalDaysWorked { get; set; }

    /// <summary>
    /// Total hours worked (sum of check-in → check-out durations).
    /// Only counts completed shifts (with check-out).
    /// </summary>
    public double TotalHoursWorked { get; set; }

    /// <summary>
    /// Total assigned shifts that had no check-in (absences).
    /// </summary>
    public int TotalAbsences { get; set; }

    /// <summary>
    /// Total shifts assigned in the period.
    /// </summary>
    public int TotalShiftsAssigned { get; set; }

    /// <summary>
    /// Average hours per day worked.
    /// </summary>
    public double AverageHoursPerDay { get; set; }

    /// <summary>
    /// Date range start (for context).
    /// </summary>
    public DateTime? FromDate { get; set; }

    /// <summary>
    /// Date range end (for context).
    /// </summary>
    public DateTime? ToDate { get; set; }
}
