namespace PlantonHub.Application.Reports;

/// <summary>
/// Tipos de relatório exportáveis pelo portal Prefeitura. Cada tipo tem
/// um template PDF; alguns também têm template Excel (KPIs não tem Excel
/// porque agrupa KPIs cards que não fazem sentido tabular).
/// Ver design.md § "Exportação PDF / Excel".
/// </summary>
public enum ReportType
{
    Kpis = 1,
    Frequency = 2,
    Atrasos = 3,
    Ausencias = 4,
    History = 5,

    // Relatórios do Admin/OS (payload vem de IManagementReportService /
    // IBillingService, não do PrefeituraService — ver ReportService.
    // GenerateFromPayloadAsync). Gerencial só tem PDF; Faturamento PDF+Excel.
    ManagementReport = 6,
    Billing = 7,
}
