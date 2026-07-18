namespace PlantonHub.Application.DTOs.Gestores;

/// <summary>
/// Payload para cadastrar um novo gestor público. O service:
///   1. Cria o <c>User</c> no Postgres (sem senha — auth é via Cognito)
///   2. Cria o user no Cognito com senha temp + email de convite
///   3. Cria o vínculo <c>UserPublicOrganRole(User, PublicOrgan,
///      GestorPublico)</c>
///
/// Endpoint restrito a <c>AdminGlobal</c> (24p7 controla quem opera os
/// órgãos vinculados aos contratos da OS).
/// </summary>
public class CreateGestorRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Cargo { get; set; }
    public Guid PublicOrganId { get; set; }
}
