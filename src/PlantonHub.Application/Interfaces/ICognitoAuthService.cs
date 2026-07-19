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
}

public record CognitoAuthResult(
    string IdToken,
    string AccessToken,
    string RefreshToken,
    int ExpiresIn
);
