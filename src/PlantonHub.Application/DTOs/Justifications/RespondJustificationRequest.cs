namespace PlantonHub.Application.DTOs.Justifications;

public class RespondJustificationRequest
{
    /// <summary>true = Approved, false = Rejected.</summary>
    public bool Approve { get; set; }

    public string ResponseText { get; set; } = string.Empty;
}
