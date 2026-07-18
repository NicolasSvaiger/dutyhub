using PlantonHub.Application.DTOs.Prefeitura;
using QuestPDF.Fluent;
using QuestPDF.Helpers;

namespace PlantonHub.Application.Reports.Pdf;

/// <summary>PDF do relatório de Frequência (previsto x realizado por UPA/dia).</summary>
public class FrequencyPdfGenerator : IReportGenerator
{
    public ReportType Type => ReportType.Frequency;
    public ReportFormat Format => ReportFormat.Pdf;
    public string ContentType => "application/pdf";
    public string FileExtension => "pdf";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not IReadOnlyList<PrefeituraFrequencyItem> data)
            throw new ArgumentException("Payload precisa ser IReadOnlyList<PrefeituraFrequencyItem>", nameof(payload));

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.Header().Element(c => SharedComponents.ComposeHeader(c, "Frequência — Prefeitura", DateTime.UtcNow));
                page.Content().Column(col =>
                {
                    col.Spacing(12);
                    col.Item().Element(c => SharedComponents.ComposeFilters(c, request, clinicName: null));

                    if (data.Count == 0)
                    {
                        col.Item().Text("Sem dados no período.").FontColor(SharedComponents.TextMuted);
                        return;
                    }

                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn();       // Data
                            c.RelativeColumn(2);      // UPA
                            c.RelativeColumn();       // Previsto
                            c.RelativeColumn();       // Realizado
                            c.RelativeColumn();       // Presença
                        });

                        table.Header(header =>
                        {
                            void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                            H("Data");
                            H("UPA");
                            H("Previsto");
                            H("Realizado");
                            H("Presença");
                        });

                        foreach (var row in data)
                        {
                            void C(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                .Padding(5).Text(t).FontSize(9);
                            C(row.Date.ToString("dd/MM/yyyy"));
                            C(row.ClinicName);
                            C(row.Expected.ToString());
                            C(row.Actual.ToString());
                            C($"{row.PresenceRate:F1}%");
                        }
                    });
                });
                page.Footer().Element(SharedComponents.ComposeFooter);
            });
        }).GeneratePdf();
    }
}
