using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IUserPublicOrganRoleRepository"/>.
///
/// Todos os métodos usam <c>AsNoTracking</c> nos reads — o
/// <c>TenantMiddleware</c> chama <see cref="GetByUserIdAsync"/> uma vez
/// por request como fallback quando o JWT não trouxe o claim
/// <c>publicOrganId</c>, e resultados nunca são mutados; carregar tracked
/// só desperdiça memória. Escritas (<see cref="AddAsync"/>,
/// <see cref="RemoveAsync"/>) rodam apenas em fluxos administrativos e
/// vão pelo change tracker padrão.
/// </summary>
public class UserPublicOrganRoleRepository : IUserPublicOrganRoleRepository
{
    private readonly AppDbContext _context;

    public UserPublicOrganRoleRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<UserPublicOrganRole>> GetByUserIdAsync(
        Guid userId,
        CancellationToken ct = default)
    {
        return await _context.UserPublicOrganRoles
            .AsNoTracking()
            .Include(r => r.PublicOrgan)  // middleware precisa do organ pra popular escopo
            .Where(r => r.UserId == userId)
            .ToListAsync(ct);
    }

    public async Task<IEnumerable<UserPublicOrganRole>> GetByOrganIdAsync(
        Guid publicOrganId,
        CancellationToken ct = default)
    {
        return await _context.UserPublicOrganRoles
            .AsNoTracking()
            .Include(r => r.User)  // caso de uso: listar gestores desse organ
            .Where(r => r.PublicOrganId == publicOrganId)
            .ToListAsync(ct);
    }

    public async Task AddAsync(UserPublicOrganRole role, CancellationToken ct = default)
    {
        await _context.UserPublicOrganRoles.AddAsync(role, ct);
        await _context.SaveChangesAsync(ct);
    }

    public async Task RemoveAsync(UserPublicOrganRole role, CancellationToken ct = default)
    {
        _context.UserPublicOrganRoles.Remove(role);
        await _context.SaveChangesAsync(ct);
    }
}
