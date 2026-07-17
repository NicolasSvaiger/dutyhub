using PlantonHub.Application.DTOs.Billing;

namespace PlantonHub.Application.Interfaces;

public interface IBillingService
{
    /// <summary>
    /// Gera o relatório de faturamento consolidado para o mês informado.
    /// AdminGlobal: agrega todos os contratos/clínicas.
    /// AdminClinica: agrega somente as clínicas autorizadas.
    /// </summary>
    Task<BillingReportResponse> GetReportAsync(int year, int month);
}
