namespace PlantonHub.Application.Exceptions;

public class ConflictException : Exception
{
    public ConflictException()
        : base("Conflict")
    {
    }

    public ConflictException(string message)
        : base(message)
    {
    }

    public ConflictException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
