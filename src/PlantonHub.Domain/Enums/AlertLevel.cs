namespace PlantonHub.Domain.Enums;

public enum AlertLevel
{
    /// <summary>Crítico — requer ação imediata.</summary>
    Critical = 1,

    /// <summary>Atenção — monitorar, ação recomendada.</summary>
    Warning = 2,

    /// <summary>Informativo — sem ação necessária.</summary>
    Info = 3,

    /// <summary>Já tratado.</summary>
    Resolved = 4
}
