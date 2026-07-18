using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

/// <summary>
/// Junction entity that binds a <see cref="User"/> to a <see cref="PublicOrgan"/>
/// with a role scoped to that organ. Today only <c>GestorPublico</c> is used —
/// same enum as <see cref="UserClinicRole"/> to keep the surface unified.
///
/// Kept separate from <c>UserClinicRole</c> because the two escopos são
/// semanticamente distintos: <c>UserClinicRole</c> significa "usuário atua
/// nessa clínica"; <c>UserPublicOrganRole</c> significa "usuário fiscaliza
/// esse orgão público" (que por sua vez cobre N clínicas via <c>Contract</c>).
/// Misturar num único junction table quebraria a leitura do modelo.
///
/// A hierarquia parent/child do <see cref="PublicOrgan"/> não é replicada
/// aqui — a resolução de escopo (gestor de raiz vê descendentes) fica no
/// <c>PrefeituraService</c>, que consulta os descendentes via
/// <see cref="Interfaces.IPublicOrganRepository"/>.
/// </summary>
public class UserPublicOrganRole
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public Guid PublicOrganId { get; set; }
    public PublicOrgan PublicOrgan { get; set; } = null!;

    /// <summary>Sempre <c>GestorPublico</c> por enquanto; enum aberto pra evolução.</summary>
    public RoleType Role { get; set; } = RoleType.GestorPublico;

    public DateTime AssignedAt { get; set; }
}
