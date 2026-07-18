namespace PlantonHub.Application.DTOs.Gestores;

/// <summary>
/// Payload de edição de gestor. Email é imutável (mudança de e-mail
/// exige migração no Cognito e re-envio de convite — flow separado).
/// PublicOrganId também é imutável (mudança de vínculo é
/// remove+recreate, evita bug de escopo inconsistente enquanto o
/// gestor ainda tem sessão ativa).
///
/// Campos <c>null</c> significam "não alterar"; passar string vazia
/// nos opcionais explicita "limpar".
/// </summary>
public class UpdateGestorRequest
{
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Cargo { get; set; }
}
