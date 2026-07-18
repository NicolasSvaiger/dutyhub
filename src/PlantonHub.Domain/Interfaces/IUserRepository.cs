using PlantonHub.Domain.Entities;

namespace PlantonHub.Domain.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id);
    Task<User?> GetByEmailAsync(string email);
    Task<IEnumerable<User>> GetAllAsync();
    Task AddAsync(User user);
    Task UpdateAsync(User user);

    /// <summary>
    /// Remove um usuário do banco. Usado como compensação em fluxos
    /// transacionais que envolvem sistemas externos (ex: rollback do
    /// <c>GestorService.CreateAsync</c> quando o Cognito falha depois
    /// do commit no Postgres). Deleção normal de usuários é fluxo de
    /// LGPD e passa por soft-delete via <c>IsActive</c>.
    /// </summary>
    Task DeleteAsync(User user);

    Task AddClinicRoleAsync(UserClinicRole clinicRole);
    Task<bool> ExistsAsync(Guid id);
    Task<bool> EmailExistsAsync(string email);
}
