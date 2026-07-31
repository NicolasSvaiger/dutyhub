namespace PlantonHub.Domain.Enums;

/// <summary>Origem do vínculo profissional↔UPA.</summary>
public enum VinculoSource
{
    /// <summary>Criado manualmente por um admin ("UPAs autorizadas").</summary>
    Manual = 1,

    /// <summary>Criado pelo auto-cadastro por raio (app mobile).</summary>
    Raio = 2
}
