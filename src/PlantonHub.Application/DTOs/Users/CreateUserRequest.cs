using PlantonHub.Domain.Enums;

namespace PlantonHub.Application.DTOs.Users;

public class CreateUserRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// Obsoleto e ignorado pelo <c>UserService.CreateAsync</c>. A autenticação
    /// real é via Cognito — o backend cria o usuário no User Pool com senha
    /// temporária aleatória e o Cognito envia o email de convite nativamente
    /// (mesmo padrão do <c>GestorService.CreateAsync</c>, Sprint 7E). Mantido
    /// no DTO só por compatibilidade com clientes antigos que ainda enviam
    /// o campo; qualquer valor é aceito e descartado.
    /// </summary>
    public string? Password { get; set; }
    public ProfessionalType? ProfessionalType { get; set; }
    public string? Cpf { get; set; }
    public string? Phone { get; set; }
    public string? RegistrationNumber { get; set; }
    public string? Specialty { get; set; }
    public string? EmploymentType { get; set; }
    public DateTime? DateOfBirth { get; set; }
}
