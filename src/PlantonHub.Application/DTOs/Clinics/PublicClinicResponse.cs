namespace PlantonHub.Application.DTOs.Clinics;

/// <summary>
/// Projeção pública e enxuta de uma UPA, exposta anonimamente para o
/// auto-cadastro (mobile) fazer o matching por raio no app. Contém só o
/// necessário (sem telefone, contrato, capacidade, tolerância, etc.).
/// </summary>
public class PublicClinicResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? City { get; set; }
    public string? State { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
}
