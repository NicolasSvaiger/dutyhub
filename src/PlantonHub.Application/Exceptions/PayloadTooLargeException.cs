namespace PlantonHub.Application.Exceptions;

/// <summary>
/// Sinaliza que o payload gerado (relatório PDF/Excel) excedeu o limite
/// aceitável de tamanho. Traduzido para HTTP 413 pelo <c>ExceptionHandlingMiddleware</c>.
/// </summary>
public class PayloadTooLargeException : Exception
{
    public PayloadTooLargeException()
        : base("Payload too large")
    {
    }

    public PayloadTooLargeException(string message)
        : base(message)
    {
    }

    public PayloadTooLargeException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
