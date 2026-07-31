namespace PlantonHub.Domain.Enums;

/// <summary>Situação do vínculo profissional↔UPA (UserClinicRole).</summary>
public enum VinculoStatus
{
    /// <summary>Sugerido pelo auto-cadastro por raio, aguardando aprovação.</summary>
    Pendente = 1,

    /// <summary>Aprovado — vínculo válido para escala.</summary>
    Aprovado = 2
}
