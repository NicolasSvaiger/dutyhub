using PlantonHub.Application.DTOs.Registration;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Auto-cadastro de profissionais (app mobile) e seu ciclo de aprovação pela OS.
/// </summary>
public interface IRegistrationService
{
    /// <summary>
    /// Auto-cadastro anônimo iniciado pelo mobile. Cria o profissional em estado
    /// <c>Pendente</c> (não loga, não é escalável), grava a biometria, cria os
    /// vínculos <c>Pendente/Raio</c> com as UPAs escolhidas e dispara um alerta
    /// para a OS aprovar. Não toca no Cognito (identidade só é provisionada na
    /// aprovação). Usa rollback compensatório se algum passo falhar.
    /// </summary>
    Task<SelfRegisterResponse> SelfRegisterAsync(SelfRegisterRequest request);

    /// <summary>
    /// Aprova um cadastro pendente (admin): ativa o profissional
    /// (<c>Status=Ativo</c>/<c>IsActive=true</c>), aprova os vínculos e
    /// provisiona a identidade no Cognito (habilita face-login).
    /// </summary>
    Task ApproveAsync(Guid userId);

    /// <summary>
    /// Rejeita um cadastro pendente (admin): marca <c>Inativo</c> e remove a
    /// biometria (LGPD). Não provisiona Cognito.
    /// </summary>
    Task RejectAsync(Guid userId, string? reason);
}
