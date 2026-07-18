namespace PlantonHub.Application.DTOs.Prefeitura;

/// <summary>
/// Linha da tabela previsto x realizado — <c>PrefeituraFrequencia.tsx</c>.
/// Uma linha por (UPA, dia). Consumido em conjunto — cada dia tem N clínicas.
/// </summary>
public class PrefeituraFrequencyItem
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public DateTime Date { get; set; }

    /// <summary>Turnos previstos pelo template + eventuais escalas ad-hoc.</summary>
    public int Expected { get; set; }

    /// <summary>Turnos com check-in registrado no dia.</summary>
    public int Actual { get; set; }

    /// <summary>Percentual (0..100). Calculado no backend pra manter consistência.</summary>
    public double PresenceRate { get; set; }
}
