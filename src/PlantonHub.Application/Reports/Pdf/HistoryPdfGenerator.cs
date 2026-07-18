using PlantonHub.Application.DTOs.Prefeitura;
using QuestPDF.Fluent;
using QuestPDF.Helpers;

namespace PlantonHub.Application.Reports.Pdf;

/// <summary>PDF do relatório de Histórico consolidado (timeline paginada).</summary>
public class HistoryPdfGenerator : IReportGenerator
{
    public ReportType Type => ReportType.History;
    public ReportFormat Format => ReportFormat.Pdf;
    public string ContentType => "application/pdf";
    public string FileExtension => "pdf";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not PrefeituraHistoryPage data)
            throw new ArgumentException("Payload precisa ser PrefeituraHistoryPage", nameof(payload));

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.Header().Element(c => SharedComponents.ComposeHeader(c, "Histórico — Prefeitura", DateTime.UtcNow));
                page.Content().Column(col =>
                {
                    col.Spacing(12);
                    col.Item().Element(c => SharedComponents.ComposeFilters(c, request, clinicName: null));

                    col.Item().Text($"Total de eventos: {data.TotalCount}").SemiBold().FontSize(11);

                    if (data.Items.Count == 0)
                    {
                        col.Item().Text("Sem eventos no período.").FontColor(SharedComponents.TextMuted);
                        return;
                    }

                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(2);      // Timestamp
                            c.RelativeColumn();       // Tipo
                            c.RelativeColumn(3);      // Descrição
                            c.RelativeColumn(2);      // Profissional
                            c.RelativeColumn(2);      // UPA
                        });

                        table.Header(header =>
                        {
                            void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                            H("Data/hora"); H("Tipo"); H("Descrição"); H("Profissional"); H("UPA");
                        });

                        foreach (var row in data.Items)
                        {
                            void C(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                .Padding(5).Text(t).FontSize(9);
                            C(row.Timestamp.ToString("dd/MM/yyyy HH:mm"));
                            C(row.Type);
                            C(row.Title);
                            C(row.UserName ?? "—");
                            C(row.ClinicName ?? "—");
                        }
                    });
                });
                page.Footer().Element(SharedComponents.ComposeFooter);
            });
        }).GeneratePdf();
    }
}
