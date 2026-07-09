namespace PlantonHub.Application.Exceptions;

public class RateLimitExceededException : Exception
{
    public RateLimitExceededException()
        : base("Taxa de requisições excedida. Tente novamente em alguns minutos.") { }

    public RateLimitExceededException(string message)
        : base(message) { }

    public RateLimitExceededException(string message, Exception innerException)
        : base(message, innerException) { }
}
