namespace PlantonHub.Application.Exceptions;

public class ConflictException : Exception
{
    /// <summary>
    /// Dados extras que o middleware serializa como extensões no ProblemDetails.
    /// Exemplo: { "code": "ACTIVE_CHECKIN_EXISTS", "activeAttendance": {...} }
    /// </summary>
    public IDictionary<string, object>? Extensions { get; }

    public ConflictException()
        : base("Conflict")
    {
    }

    public ConflictException(string message)
        : base(message)
    {
    }

    public ConflictException(string message, IDictionary<string, object> extensions)
        : base(message)
    {
        Extensions = extensions;
    }

    public ConflictException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
