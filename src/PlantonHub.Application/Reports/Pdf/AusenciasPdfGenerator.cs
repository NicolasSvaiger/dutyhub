using PlantonHub.Application.DTOs.Prefeitura;
using QuestPDF.Fluent;
using QuestPDF.Helpers;

namespace PlantonHub.Application.Reports.Pdf;

/// <summary>PDF do relatório de Ausências (Absences filtrado por type=absence).</summary>
public class AusenciasPdfGenerator : IReportGenerator
{
    public ReportType Type => ReportType.Ausencias;
    public ReportFormat Format => ReportFormat.Pdf;
    public string ContentType => "application/pdf";
    public string FileExtension => "pdf";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not IReadOnlyList<PrefeituraAbsenceItem> data)
            throw new ArgumentException("Payload precisa ser IReadOnlyList<PrefeituraAbsenceItem>", nameof(payload));

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.Header().Element(c => SharedComponents.ComposeHeader(c, "Ausências — Prefeitura", DateTime.UtcNow));
                page.Content().Column(col =>
                {
                    col.Spacing(12);
                    col.Item().Element(c => SharedComponents.ComposeFilters(c, request, clinicName: null));

                    var absenceOnly = data.Where(i => i.Type == "absence").ToList();

                    col.Item().Text($"Total de ausências: {absenceOnly.Count}").SemiBold().FontSize(11);

                    if (absenceOnly.Count == 0)
                    {
                        col.Item().Text("Sem ausências no período.").FontColor(SharedComponents.TextMuted);
                        return;
                    }

                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn();       // Data
                            c.RelativeColumn(2);      // Profissional
                            c.RelativeColumn(2);      // UPA
                            c.RelativeColumn(2);      // Turno
                            c.RelativeColumn();       // Justificado
                            c.RelativeColumn(2);      // Substituto
                        });

                        table.Header(header =>
                        {
                            void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                            H("Data"); H("Profissional"); H("UPA"); H("Turno"); H("Justificado"); H("Substituto");
                        });

                        foreach (var row in absenceOnly)
                        {
                            void C(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                .Padding(5).Text(t).FontSize(9);
                            C(row.Date.ToString("dd/MM/yyyy"));
                            C(row.UserName);
                            C(row.ClinicName);
                            C(row.ShiftLabel);
                            C(row.Justified ? "Sim" : "Não");
                            C(row.SubstituteName ?? "—");
                        }
                    });
                });
                page.Footer().Element(SharedComponents.ComposeFooter);
            });
        }).GeneratePdf();
    }
}
