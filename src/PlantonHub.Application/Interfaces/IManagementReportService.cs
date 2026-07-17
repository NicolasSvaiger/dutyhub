using PlantonHub.Application.DTOs.ManagementReport;

namespace PlantonHub.Application.Interfaces;

public interface IManagementReportService
{
    /// <summary>
    /// Gera o relatório gerencial para o mês/ano informado. Se ano/mês forem
    /// nulos, usa o mês corrente. Apenas AdminGlobal (a OS enxerga tudo).
    /// </summary>
    Task<ManagementReportResponse> GetReportAsync(int? year = null, int? month = null);
}
