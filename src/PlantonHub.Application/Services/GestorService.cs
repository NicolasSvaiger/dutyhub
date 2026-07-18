using PlantonHub.Application.DTOs.Gestores;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

/// <summary>
/// Implementação do fluxo administrativo de cadastro de gestores públicos.
/// Ver <see cref="IGestorService"/> pra semântica e autorização.
///
/// Não usa transaction do EF Core pra abraçar Postgres + Cognito porque
/// são sistemas diferentes. A compensação manual (delete no Cognito
/// quando o DB falha) cobre o caso comum. Falhas de rede depois do
/// commit no DB deixariam o Cognito num estado inconsistente que só
/// seria detectado no próximo login do gestor — trade-off aceito
/// (raridade + baixo impacto porque o user é convidado, não paga).
/// </summary>
public class GestorService : IGestorService
{
    private readonly IUserRepository _userRepository;
    private readonly IUserPublicOrganRoleRepository _rolesRepository;
    private readonly IPublicOrganRepository _publicOrganRepository;
    private readonly ITenantService _tenantService;
    private readonly ICognitoAuthService _cognitoAuthService;
    private readonly ICacheService _cacheService;

    public GestorService(
        IUserRepository userRepository,
        IUserPublicOrganRoleRepository rolesRepository,
        IPublicOrganRepository publicOrganRepository,
        ITenantService tenantService,
        ICognitoAuthService cognitoAuthService,
        ICacheService cacheService)
    {
        _userRepository = userRepository;
        _rolesRepository = rolesRepository;
        _publicOrganRepository = publicOrganRepository;
        _tenantService = tenantService;
        _cognitoAuthService = cognitoAuthService;
        _cacheService = cacheService;
    }

    // ── Leitura ────────────────────────────────────────────────────────

    public async Task<IEnumerable<GestorResponse>> GetAllAsync(Guid? publicOrganId = null)
    {
        EnsureCanRead();

        // Se publicOrganId foi passado, filtra direto no repositório
        // (usa o índice IX_UserPublicOrganRole_PublicOrganId). Se não,
        // varremos usuários — só há um punhado de gestores por OS na
        // realidade, então sem risco de N+1 catastrófico.
        if (publicOrganId.HasValue)
        {
            var roles = await _rolesRepository.GetByOrganIdAsync(publicOrganId.Value);
            return roles.Select(MapToResponse).ToList();
        }

        // Sem filtro: listar todos. Buscar os users com PublicOrgan
        // navigation carregada é feito no repositório via Include (o
        // GetByOrganIdAsync já usa Include). Aqui iteramos os organs
        // ativos e pegamos os roles de cada.
        var organs = await _publicOrganRepository.GetAllAsync();
        var all = new List<GestorResponse>();
        foreach (var organ in organs)
        {
            var roles = await _rolesRepository.GetByOrganIdAsync(organ.Id);
            all.AddRange(roles.Select(MapToResponse));
        }
        return all;
    }

    public async Task<GestorResponse?> GetByIdAsync(Guid userId)
    {
        EnsureCanRead();

        var roles = await _rolesRepository.GetByUserIdAsync(userId);
        var role = roles.FirstOrDefault();
        return role is null ? null : MapToResponse(role);
    }

    // ── Escrita (só AdminGlobal) ───────────────────────────────────────

    public async Task<GestorResponse> CreateAsync(CreateGestorRequest request)
    {
        EnsureCanWrite();

        if (await _userRepository.EmailExistsAsync(request.Email))
        {
            throw new ConflictException($"Um usuário com o email '{request.Email}' já existe.");
        }

        var organ = await _publicOrganRepository.GetByIdAsync(request.PublicOrganId)
            ?? throw new NotFoundException($"Órgão público com id '{request.PublicOrganId}' não encontrado.");

        var now = DateTime.UtcNow;
        var user = new User
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Email = request.Email.Trim().ToLowerInvariant(),
            // PasswordHash é obrigatório na entidade (legado). Como auth
            // real é via Cognito, geramos um hash "impossível" — bcrypt
            // de string aleatória que nunca é usada. Se algum dia o
            // fallback local for reativado, a senha continua bloqueada
            // até reset via Cognito.
            PasswordHash = "$2a$11$" + Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now,
            // ProfessionalType é null — gestor não é profissional de saúde.
        };

        await _userRepository.AddAsync(user);

        try
        {
            // Cria user no Cognito com senha temporária + envia email de
            // convite. Idempotente — se já existe, retorna sem erro.
            await _cognitoAuthService.CreateInvitedUserAsync(user.Email, user.Name);
        }
        catch
        {
            // Compensação: user já foi persistido no Postgres mas o
            // Cognito falhou. Rollback via delete no Postgres. Se o
            // rollback também falhar, propagamos a exception original
            // — o admin pode reexecutar (o email verificaria conflito).
            try { await _userRepository.DeleteAsync(user); }
            catch { /* rollback best-effort — original exception é o que importa */ }
            throw;
        }

        // Cognito ok — cria vínculo. Se falhar aqui, compensamos ambos
        // (Postgres user + Cognito user).
        try
        {
            await _rolesRepository.AddAsync(new UserPublicOrganRole
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                PublicOrganId = organ.Id,
                Role = RoleType.GestorPublico,
                AssignedAt = now,
            });
        }
        catch
        {
            try { await _userRepository.DeleteAsync(user); } catch { }
            try { await _cognitoAuthService.DeleteUserAsync(user.Email); } catch { }
            throw;
        }

        // Invalida cache do PrefeituraService — o novo gestor precisa
        // enxergar seu organ no próximo login sem esperar TTL.
        await _cacheService.RemoveByPrefixAsync("prefeitura:");

        return new GestorResponse
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Phone = user.Phone,
            Cargo = request.Cargo,
            PublicOrganId = organ.Id,
            PublicOrganName = organ.Name,
            PublicOrganAcronym = organ.Acronym,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
            AssignedAt = now,
        };
    }

    public async Task<GestorResponse?> UpdateAsync(Guid userId, UpdateGestorRequest request)
    {
        EnsureCanWrite();

        var user = await _userRepository.GetByIdAsync(userId);
        if (user is null) return null;

        // Garantimos que o user é gestor antes de deixar editar por
        // esse endpoint (evita usar UpdateAsync do GestorService pra
        // editar médicos que compartilham a mesma tabela User).
        var roles = (await _rolesRepository.GetByUserIdAsync(userId)).ToList();
        if (roles.Count == 0) return null;

        if (request.Name is not null && !string.IsNullOrWhiteSpace(request.Name))
            user.Name = request.Name.Trim();
        if (request.Phone is not null)
            user.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();

        user.UpdatedAt = DateTime.UtcNow;
        await _userRepository.UpdateAsync(user);

        await _cacheService.RemoveByPrefixAsync("prefeitura:");

        var role = roles[0];
        return new GestorResponse
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Phone = user.Phone,
            Cargo = request.Cargo,
            PublicOrganId = role.PublicOrganId,
            PublicOrganName = role.PublicOrgan?.Name ?? string.Empty,
            PublicOrganAcronym = role.PublicOrgan?.Acronym,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
            AssignedAt = role.AssignedAt,
        };
    }

    public async Task<GestorResponse?> ToggleStatusAsync(Guid userId)
    {
        EnsureCanWrite();

        var user = await _userRepository.GetByIdAsync(userId);
        if (user is null) return null;

        var roles = (await _rolesRepository.GetByUserIdAsync(userId)).ToList();
        if (roles.Count == 0) return null;

        user.IsActive = !user.IsActive;
        user.UpdatedAt = DateTime.UtcNow;
        await _userRepository.UpdateAsync(user);

        await _cacheService.RemoveByPrefixAsync("prefeitura:");

        return MapToResponse(roles[0]);
    }

    public async Task RemoveAsync(Guid userId)
    {
        EnsureCanWrite();

        var roles = (await _rolesRepository.GetByUserIdAsync(userId)).ToList();
        foreach (var role in roles)
        {
            await _rolesRepository.RemoveAsync(role);
        }

        await _cacheService.RemoveByPrefixAsync("prefeitura:");
        // User em si é preservado (LGPD — audit trail mantém referências).
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private void EnsureCanRead()
    {
        var roles = _tenantService.GetCurrentRoles();
        var isAdminGlobal = _tenantService.IsAdminGlobal();
        var isAdminClinica = roles.Contains(RoleType.AdminClinica.ToString(), StringComparer.OrdinalIgnoreCase);

        if (!isAdminGlobal && !isAdminClinica)
        {
            throw new ForbiddenException("Only AdminGlobal or AdminClinica can list gestores.");
        }
    }

    private void EnsureCanWrite()
    {
        // Cadastro exclusivo 24p7 (AdminGlobal). AdminClinica é read-only.
        if (!_tenantService.IsAdminGlobal())
        {
            throw new ForbiddenException("Only AdminGlobal can manage gestores.");
        }
    }

    private static GestorResponse MapToResponse(UserPublicOrganRole role)
    {
        var user = role.User;
        return new GestorResponse
        {
            Id = role.UserId,
            Name = user?.Name ?? string.Empty,
            Email = user?.Email ?? string.Empty,
            Phone = user?.Phone,
            Cargo = null,
            PublicOrganId = role.PublicOrganId,
            PublicOrganName = role.PublicOrgan?.Name ?? string.Empty,
            PublicOrganAcronym = role.PublicOrgan?.Acronym,
            IsActive = user?.IsActive ?? false,
            CreatedAt = user?.CreatedAt ?? DateTime.MinValue,
            AssignedAt = role.AssignedAt,
        };
    }
}
