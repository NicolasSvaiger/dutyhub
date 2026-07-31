namespace PlantonHub.Application.DTOs.Gestores;

/// <summary>
/// Vista de um gestor público (usuário com role <c>GestorPublico</c>
/// vinculado a um <c>PublicOrgan</c>). Usado nas listagens e no detalhe
/// do cadastro em Admin OS → Gestores.
///
/// Note: <c>Cargo</c> não é uma coluna própria de <c>User</c> — vem do
/// atributo Cognito ou de um campo auxiliar. Por enquanto o service
/// devolve <c>null</c> aqui e o frontend renderiza "—". Sprint futura
/// pode formalizar a coluna se necessário.
/// </summary>
public class GestorResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Cargo { get; set; }
    public Guid PublicOrganId { get; set; }
    public string PublicOrganName { get; set; } = string.Empty;
    public string? PublicOrganAcronym { get; set; }
    public bool IsActive { get; set; }

    /// <summary>
    /// <c>true</c> quando o gestor foi convidado mas ainda não completou o
    /// primeiro login (status <c>FORCE_CHANGE_PASSWORD</c> no Cognito).
    /// Populado nas listagens/detalhe. Habilita "Reenviar convite".
    /// </summary>
    public bool InvitePending { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime AssignedAt { get; set; }
}
