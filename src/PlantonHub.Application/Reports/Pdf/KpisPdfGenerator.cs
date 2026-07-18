using PlantonHub.Application.DTOs.Prefeitura;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace PlantonHub.Application.Reports.Pdf;

/// <summary>
/// PDF do relatório de KPIs — 1 página A4 com os totais globais + tabela
/// de breakdown por UPA. Payload esperado: <see cref="PrefeituraKpisResponse"/>.
/// </summary>
public class KpisPdfGenerator : IReportGenerator
{
    public ReportType Type => ReportType.Kpis;
    public ReportFormat Format => ReportFormat.Pdf;
    public string ContentType => "application/pdf";
    public string FileExtension => "pdf";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not PrefeituraKpisResponse data)
            throw new ArgumentException("Payload precisa ser PrefeituraKpisResponse", nameof(payload));

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.Header().Element(c => SharedComponents.ComposeHeader(c, "KPIs — Prefeitura", DateTime.UtcNow));
                page.Content().Column(col =>
                {
                    col.Spacing(12);
                    col.Item().Element(c => SharedComponents.ComposeFilters(c, request, clinicName: null));

                    // Totais do período — grid 4 colunas de KPIs.
                    col.Item().Text("Totais do período").SemiBold().FontSize(12);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn();
                            c.RelativeColumn();
                            c.RelativeColumn();
                            c.RelativeColumn();
                        });

                        void Kpi(string label, string value)
                        {
                            table.Cell().Border(1).BorderColor(SharedComponents.BorderColor).Padding(6).Column(c =>
                            {
                                c.Item().Text(label).FontSize(8).FontColor(SharedComponents.TextMuted);
                                c.Item().PaddingTop(2).Text(value).FontSize(13).SemiBold();
                            });
                        }

                        Kpi("Cumprimento global", $"{data.GlobalComplianceRate:F1}%");
                        Kpi("Plantões previstos", data.TotalExpectedShifts.ToString());
                        Kpi("Plantões cobertos", data.TotalCoveredShifts.ToString());
                        Kpi("Ausências", data.TotalAbsences.ToString());
                        Kpi("Atrasos", data.TotalLateEvents.ToString());
                        Kpi("Média min. atraso", $"{data.AverageLateMinutes:F1}");
                        Kpi("Taxa substituição", $"{data.SubstitutionRate:F1}%");
                        Kpi("UPAs analisadas", data.ByClinic.Count.ToString());
                    });

                    // Detalhamento por UPA.
                    col.Item().PaddingTop(6).Text("Detalhamento por UPA").SemiBold().FontSize(12);

                    if (data.ByClinic.Count == 0)
                    {
                        col.Item().Text("Sem dados no período.").FontColor(SharedComponents.TextMuted);
                        return;
                    }

                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(3);
                            c.RelativeColumn();
                            c.RelativeColumn();
                            c.RelativeColumn();
                            c.RelativeColumn();
                            c.RelativeColumn();
                        });

                        table.Header(header =>
                        {
                            void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                            H("UPA");
                            H("Cumprimento");
                            H("Previsto");
                            H("Coberto");
                            H("Ausências");
                            H("Atrasos");
                        });

                        foreach (var row in data.ByClinic)
                        {
                            void C(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                .Padding(5).Text(t).FontSize(9);
                            C(row.ClinicName);
                            C($"{row.ComplianceRate:F1}%");
                            C(row.ExpectedShifts.ToString());
                            C(row.CoveredShifts.ToString());
                            C(row.Absences.ToString());
                            C(row.LateEvents.ToString());
                        }
                    });
                });
                page.Footer().Element(SharedComponents.ComposeFooter);
            });
        }).GeneratePdf();
    }
}
