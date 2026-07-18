using Microsoft.EntityFrameworkCore;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Repositories;

public class PublicOrganRepository : IPublicOrganRepository
{
    private readonly AppDbContext _context;
    public PublicOrganRepository(AppDbContext context) => _context = context;

    public async Task<PublicOrgan?> GetByIdAsync(Guid id) =>
        await _context.PublicOrgans
            .Include(p => p.Parent)
            .Include(p => p.Children)
            .FirstOrDefaultAsync(p => p.Id == id);

    public async Task<IEnumerable<PublicOrgan>> GetAllAsync() =>
        await _context.PublicOrgans
            .Include(p => p.Parent)
            .Include(p => p.Children)
            .OrderBy(p => p.Name)
            .ToListAsync();

    public async Task<IEnumerable<PublicOrgan>> GetRootsAsync() =>
        await _context.PublicOrgans
            .Include(p => p.Children)
            .Where(p => p.ParentId == null)
            .OrderBy(p => p.Name)
            .ToListAsync();

    public async Task<IEnumerable<PublicOrgan>> GetChildrenAsync(Guid parentId) =>
        await _context.PublicOrgans
            .Where(p => p.ParentId == parentId)
            .OrderBy(p => p.Name)
            .ToListAsync();

    public async Task AddAsync(PublicOrgan organ)
    {
        _context.PublicOrgans.Add(organ);
        await _context.SaveChangesAsync();
    }

    public async Task UpdateAsync(PublicOrgan organ)
    {
        _context.PublicOrgans.Update(organ);
        await _context.SaveChangesAsync();
    }

    public async Task<IEnumerable<Guid>> GetDescendantIdsAsync(Guid rootId, CancellationToken ct = default)
    {
        // Walk in-memory: uma tupla (Id, ParentId) por organ ativo é o
        // suficiente pra montar a subárvore. Datasets reais têm ~50 nós,
        // AsNoTracking + projeção é O(n) e cabe na RAM tranquilo.
        // Ver design.md § D3.
        var edges = await _context.PublicOrgans
            .AsNoTracking()
            .Select(p => new { p.Id, p.ParentId })
            .ToListAsync(ct);

        // Curto-circuita quando o organ não existe.
        if (!edges.Any(e => e.Id == rootId))
        {
            return Array.Empty<Guid>();
        }

        // Mapa parentId → [childIds] pra descidas em O(1).
        var byParent = edges
            .Where(e => e.ParentId.HasValue)
            .GroupBy(e => e.ParentId!.Value)
            .ToDictionary(g => g.Key, g => g.Select(e => e.Id).ToList());

        // BFS defensivo — usar HashSet evita loops infinitos caso a árvore
        // já tenha inconsistência (ciclo por bug de seed / import).
        var result = new HashSet<Guid> { rootId };
        var queue = new Queue<Guid>();
        queue.Enqueue(rootId);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!byParent.TryGetValue(current, out var children)) continue;

            foreach (var childId in children)
            {
                if (result.Add(childId))
                {
                    queue.Enqueue(childId);
                }
            }
        }

        return result;
    }
}
