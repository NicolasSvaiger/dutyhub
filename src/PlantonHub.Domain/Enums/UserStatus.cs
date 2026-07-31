namespace PlantonHub.Domain.Enums;

/// <summary>Situação do profissional no sistema.</summary>
public enum UserStatus
{
    /// <summary>Auto-cadastro recebido, aguardando aprovação da OS.</summary>
    Pendente = 1,

    /// <summary>Ativo — pode autenticar e ser escalado.</summary>
    Ativo = 2,

    /// <summary>Inativo / desativado (inclui cadastro rejeitado).</summary>
    Inativo = 3
}
