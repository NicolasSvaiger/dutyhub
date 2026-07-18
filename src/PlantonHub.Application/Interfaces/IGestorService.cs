using PlantonHub.Application.DTOs.Gestores;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Gestão administrativa de gestores públicos (usuários com role
/// <c>GestorPublico</c> vinculados a um <c>PublicOrgan</c>).
///
/// Autorização:
/// <list type="bullet">
///   <item>Leitura (GetAll, GetById): AdminGlobal + AdminClinica.
///     AdminClinica vê a lista pra ter visibilidade dos gestores das
///     prefeituras dos seus contratos.</item>
///   <item>Escrita (Create, Update, ToggleStatus, Remove): apenas
///     AdminGlobal. A OS (24p7) controla quem opera os órgãos —
///     AdminClinica não pode cadastrar nem editar gestores.</item>
/// </list>
///
/// Cadastro orquestra 3 sistemas (Postgres + Cognito + UserPublicOrganRole)
/// com rollback compensatório em falhas parciais. Ver <see cref="CreateAsync"/>.
/// </summary>
public interface IGestorService
{
    /// <summary>
    /// Lista todos os gestores, opcionalmente filtrados por
    /// <paramref name="publicOrganId"/>. Sem filtro, retorna todos os
    /// vínculos <c>UserPublicOrganRole</c> visíveis para o admin logado.
    /// </summary>
    Task<IEnumerable<GestorResponse>> GetAllAsync(Guid? publicOrganId = null);

    /// <summary>
    /// Retorna o gestor com o user id informado, ou null se não existe
    /// ou o admin logado não tem permissão de vê-lo.
    /// </summary>
    Task<GestorResponse?> GetByIdAsync(Guid userId);

    /// <summary>
    /// Cadastra um novo gestor. Pipeline transacional-ish:
    /// <list type="number">
    ///   <item>Valida email único no Postgres e existência do
    ///     <c>PublicOrgan</c>.</item>
    ///   <item>Cria <c>User</c> no Postgres (sem senha — auth via Cognito).</item>
    ///   <item>Cria user no Cognito com senha temp aleatória + email
    ///     de convite via <c>ICognitoAuthService.CreateInvitedUserAsync</c>.</item>
    ///   <item>Cria <c>UserPublicOrganRole</c> ligando user ↔ organ com
    ///     role <c>GestorPublico</c>.</item>
    ///   <item>Compensação: se qualquer etapa falha depois do Cognito,
    ///     chama <c>DeleteUserAsync</c> pra evitar deixar user órfão no pool.</item>
    /// </list>
    /// </summary>
    Task<GestorResponse> CreateAsync(CreateGestorRequest request);

    /// <summary>
    /// Atualiza campos editáveis do gestor. Email e PublicOrganId são
    /// imutáveis por esse endpoint — trocar vínculo é Remove + Create.
    /// </summary>
    Task<GestorResponse?> UpdateAsync(Guid userId, UpdateGestorRequest request);

    /// <summary>
    /// Alterna <c>User.IsActive</c>. Gestor inativo perde acesso ao
    /// portal (o middleware ainda deixa passar o token, mas o
    /// PrefeituraService valida <c>IsActive</c> no <c>GetDashboard</c>
    /// e retorna 403). Não invalida a sessão Cognito ativa — sprint
    /// futura pode adicionar revoke de refresh token.
    /// </summary>
    Task<GestorResponse?> ToggleStatusAsync(Guid userId);

    /// <summary>
    /// Remove o vínculo <c>UserPublicOrganRole</c>. O <c>User</c> em
    /// si é preservado (LGPD — histórico de audit precisa manter
    /// referências). Também não deleta o user do Cognito por default —
    /// ele fica órfão mas inofensivo (sem role, o middleware nega
    /// acesso a qualquer portal). Deleção de conta é fluxo separado.
    /// </summary>
    Task RemoveAsync(Guid userId);
}
