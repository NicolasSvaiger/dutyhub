using PlantonHub.Domain.Enums;

namespace PlantonHub.Domain.Entities;

public class UserClinicRole
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ClinicId { get; set; }
    public RoleType Role { get; set; }
    public DateTime AssignedAt { get; set; }

    /// <summary>Situação do vínculo: Pendente (auto-cadastro) ou Aprovado (manual/aprovado).</summary>
    public VinculoStatus Status { get; set; } = VinculoStatus.Aprovado;

    /// <summary>Origem do vínculo: Manual (admin) ou Raio (auto-cadastro mobile).</summary>
    public VinculoSource Source { get; set; } = VinculoSource.Manual;

    // Navigation properties
    public User User { get; set; } = null!;
    public Clinic Clinic { get; set; } = null!;
}
