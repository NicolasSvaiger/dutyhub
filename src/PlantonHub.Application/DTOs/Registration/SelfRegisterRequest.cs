using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Registration;

/// <summary>
/// Auto-cadastro de profissional iniciado pelo app mobile. Espelha o cadastro
/// da tela admin (infos + vínculos + biometria), mas cria o profissional em
/// estado <c>Pendente</c> aguardando aprovação da OS. Endpoint anônimo.
/// </summary>
public class SelfRegisterRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Cpf { get; set; }
    public string? Phone { get; set; }

    /// <summary>Médico ou Enfermeiro — o enum não permite perfis administrativos.</summary>
    public ProfessionalType? ProfessionalType { get; set; }

    /// <summary>Registro no conselho (CRM / COREN).</summary>
    public string? RegistrationNumber { get; set; }
    public string? Specialty { get; set; }
    public string? EmploymentType { get; set; }
    public DateTime? DateOfBirth { get; set; }

    /// <summary>UPAs escolhidas pelo raio no app — viram vínculos Pendente/Raio.</summary>
    public List<Guid> ClinicIds { get; set; } = new();

    /// <summary>
    /// Biometria OPCIONAL por enquanto. A validação vai migrar para um provedor
    /// externo (Techmag), com modelo de hash — deixado para depois. Se enviado,
    /// deve ter 128 floats (modelo atual, mesmo do enroll/check-in) e é gravado.
    /// </summary>
    public float[] FaceEmbedding { get; set; } = Array.Empty<float>();

    /// <summary>Foto opcional (auditoria). Hoje não é persistida — igual ao enroll atual.</summary>
    public string? FacePhotoBase64 { get; set; }
}
