namespace PlantonHub.Application.DTOs.PublicOrgans;

public class PublicOrganResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Acronym { get; set; }
    public string? Cnpj { get; set; }
    public string? Department { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? ContactName { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public Guid? ParentId { get; set; }
    public string? ParentName { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<PublicOrganResponse> Children { get; set; } = new();
}
