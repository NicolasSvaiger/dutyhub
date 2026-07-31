namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Service for server-side Cognito authentication operations.
/// Uses CUSTOM_AUTH flow: after face verification succeeds, this service
/// authenticates the user via Cognito's custom challenge (HMAC-based, no passwords).
/// </summary>
public interface ICognitoAuthService
{
    /// <summary>
    /// Authenticate a user via Cognito CUSTOM_AUTH flow.
    /// Returns ID Token, Access Token, and Refresh Token.
    /// </summary>
    Task<CognitoAuthResult> AuthenticateAsync(string email);

    /// <summary>
    /// Ensure the user exists in Cognito (create if not).
    /// Called when a new professional is onboarded for face-login.
    /// No password is set — CUSTOM_AUTH flow doesn't require one.
    /// </summary>
    Task EnsureUserExistsAsync(string email);

    /// <summary>
    /// Cria um novo usuário no Cognito com senha temporária aleatória e
    /// deixa o Cognito enviar o email de convite (welcome + credenciais
    /// temp). Usado no cadastro administrativo de gestores da Prefeitura
    /// via Admin OS — o convidado troca a senha no primeiro login pelo
    /// challenge <c>NEW_PASSWORD_REQUIRED</c> do Cognito.
    ///
    /// Idempotente: se o usuário já existe (<see cref="UsernameExistsException"/>
    /// ou verificação prévia via AdminGetUser), a chamada retorna sem
    /// exceção. Isso permite retry seguro em caso de falha parcial no
    /// pipeline (ex: DB rollback deixou o Cognito em estado consistente).
    ///
    /// A senha temp é gerada com <c>RandomNumberGenerator</c> e nunca
    /// retornada — o gestor recebe pelo email do Cognito e é obrigado a
    /// trocar no primeiro acesso.
    /// </summary>
    /// <param name="email">Email do gestor (usado como Username e claim).</param>
    /// <param name="name">Nome exibido (claim <c>name</c> do Cognito).</param>
    Task CreateInvitedUserAsync(string email, string name);

    /// <summary>
    /// Remove o usuário do Cognito. Usado como compensação (rollback) quando
    /// o cadastro no Postgres falha após a criação no Cognito ter sucesso,
    /// e no fluxo administrativo de desativação definitiva (LGPD).
    ///
    /// Idempotente: <see cref="UserNotFoundException"/> é silenciosamente
    /// ignorada — se o user já não existe, o efeito desejado já está
    /// alcançado.
    /// </summary>
    Task DeleteUserAsync(string email);

    /// <summary>
    /// Atualiza o atributo <c>email</c> de um usuário existente no Cognito.
    /// O User Pool usa <c>signInAliases: {{ email: true }}</c> — o username
    /// interno (sub) não muda, só o alias de login, então essa troca não
    /// afeta sessões já ativas nem exige recriar o usuário.
    ///
    /// <paramref name="oldEmail"/> é usado como <c>Username</c> na chamada
    /// AdminUpdateUserAttributes (é como o Cognito identifica o usuário
    /// hoje, antes da troca). Idempotente por natureza — se o valor já é o
    /// mesmo, o Cognito só confirma sem efeito colateral.
    /// </summary>
    Task UpdateEmailAsync(string oldEmail, string newEmail);

    /// <summary>
    /// Indica se o convite de um usuário ainda está <b>pendente</b> — ou
    /// seja, o usuário foi criado via <see cref="CreateInvitedUserAsync"/>
    /// mas nunca completou o primeiro login (troca de senha do challenge
    /// <c>NEW_PASSWORD_REQUIRED</c>). No Cognito isso corresponde ao
    /// <c>UserStatus == FORCE_CHANGE_PASSWORD</c>. Quando o convidado faz
    /// o primeiro acesso e define a senha, o status vira <c>CONFIRMED</c>
    /// e este método passa a retornar <c>false</c>.
    ///
    /// Retorna <c>false</c> se o usuário não existe no Cognito (não há
    /// convite pra estar pendente) — evita quebrar telas com usuários
    /// legados/seed que só existem no Postgres.
    /// </summary>
    Task<bool> IsInvitePendingAsync(string email);

    /// <summary>
    /// Versão em lote de <see cref="IsInvitePendingAsync"/> para telas de
    /// listagem — evita N chamadas <c>AdminGetUser</c>. Pagina
    /// <c>ListUsers</c> do pool uma vez e devolve um mapa
    /// <c>email (lowercase) → convite pendente?</c> restrito aos
    /// <paramref name="emails"/> informados. Emails ausentes do pool não
    /// aparecem no mapa (o chamador trata como não-pendente).
    /// </summary>
    Task<IReadOnlyDictionary<string, bool>> GetInvitePendingMapAsync(IEnumerable<string> emails);

    /// <summary>
    /// Reenvia o email de convite (welcome + nova senha temporária) para um
    /// usuário que <b>ainda não aceitou</b> — via <c>AdminCreateUser</c> com
    /// <c>MessageAction=RESEND</c>, que reseta a expiração da senha temp.
    ///
    /// Só é válido enquanto o usuário está em <c>FORCE_CHANGE_PASSWORD</c>.
    /// Se o usuário já aceitou (status <c>CONFIRMED</c>), o Cognito lança
    /// <c>UnsupportedUserStateException</c> — este método traduz para
    /// <see cref="Exceptions.ConflictException"/>. Se o usuário não existe,
    /// traduz para <see cref="Exceptions.NotFoundException"/>. O guard de
    /// negócio ("só pendentes") fica na camada de serviço, mas este método
    /// é defensivo por conta própria.
    /// </summary>
    Task ResendInviteAsync(string email);
}

public record CognitoAuthResult(
    string IdToken,
    string AccessToken,
    string RefreshToken,
    int ExpiresIn
);
