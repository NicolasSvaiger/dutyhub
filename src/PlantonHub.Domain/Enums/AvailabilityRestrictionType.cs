namespace PlantonHub.Domain.Enums;

/// <summary>
/// Tipo de restrição de disponibilidade de um profissional.
/// Impacta a escalação automática — restrições ativas bloqueiam a atribuição
/// do profissional nas datas/turnos correspondentes.
/// </summary>
public enum AvailabilityRestrictionType
{
    /// <summary>Férias — bloqueio total no período.</summary>
    Ferias = 1,

    /// <summary>Licença médica — bloqueio total no período.</summary>
    LicencaMedica = 2,

    /// <summary>Afastamento administrativo (ex: perícia, INSS).</summary>
    AfastamentoAdministrativo = 3,

    /// <summary>Restrição a turnos específicos (Manhã/Tarde/Noite).</summary>
    RestricaoTurno = 4,

    /// <summary>Restrição recorrente por dias da semana (ex: fins de semana).</summary>
    DiasEspecificos = 5,
}
