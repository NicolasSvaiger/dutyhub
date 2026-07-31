using PlantonHub.Application.DTOs.ManagementReport;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace PlantonHub.Application.Reports.Pdf;

/// <summary>
/// Versão "apresentação" do relatório Gerencial — PDF em paisagem, estilo
/// slides (um bloco por página, fontes grandes) para projetar em reunião.
/// Mesmo payload do <see cref="ManagementReportPdfGenerator"/>
/// (<see cref="ManagementReportResponse"/>), só muda o layout.
/// </summary>
public class ManagementPresentationPdfGenerator : IReportGenerator
{
    public ReportType Type => ReportType.ManagementPresentation;
    public ReportFormat Format => ReportFormat.Pdf;
    public string ContentType => "application/pdf";
    public string FileExtension => "pdf";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not ManagementReportResponse data)
            throw new ArgumentException("Payload precisa ser ManagementReportResponse", nameof(payload));

        var periodo = string.IsNullOrWhiteSpace(data.PeriodLabel) ? $"{data.Month:00}/{data.Year}" : data.PeriodLabel;

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(40);
                page.DefaultTextStyle(t => t.FontColor("#12303a"));
                page.Footer().AlignRight().Text(txt =>
                {
                    txt.DefaultTextStyle(TextStyle.Default.FontSize(9).FontColor(SharedComponents.TextMuted));
                    txt.Span("24p7 · Relatório Gerencial · ");
                    txt.CurrentPageNumber();
                    txt.Span("/");
                    txt.TotalPages();
                });

                page.Content().Column(root =>
                {
                    // ── Slide 1 — capa ─────────────────────────────────────
                    root.Item().Extend().Column(col =>
                    {
                        col.Item().PaddingTop(40).Text("24p7").FontSize(20).Bold().FontColor(SharedComponents.BrandTeal);
                        col.Item().PaddingTop(20).Text("Relatório Gerencial").FontSize(40).Bold();
                        col.Item().Text($"Apresentação executiva · {periodo}").FontSize(18).FontColor(SharedComponents.TextMuted);
                        col.Item().PaddingTop(50).Text("SLA global da OS").FontSize(16).FontColor(SharedComponents.TextMuted);
                        col.Item().Text(SharedComponents.Percent(data.SlaGlobal.Value)).FontSize(72).Bold().FontColor(SharedComponents.BrandTeal);
                        if (!string.IsNullOrWhiteSpace(data.SlaGlobal.Label))
                            col.Item().Text(data.SlaGlobal.Label).FontSize(14).FontColor(SharedComponents.TextMuted);
                    });
                    root.Item().PageBreak();

                    // ── Slide 2 — indicadores ──────────────────────────────
                    root.Item().Text("Indicadores do período").FontSize(28).Bold();
                    root.Item().PaddingTop(20).Row(row =>
                    {
                        row.Spacing(16);
                        void BigKpi(string label, string value, string color)
                        {
                            row.RelativeItem().Border(1).BorderColor(SharedComponents.BorderColor).Padding(20).Column(c =>
                            {
                                c.Item().Text(label).FontSize(14).FontColor(SharedComponents.TextMuted);
                                c.Item().PaddingTop(10).Text(value).FontSize(44).Bold().FontColor(color);
                            });
                        }
                        BigKpi("SLA global", SharedComponents.Percent(data.SlaGlobal.Value), SharedComponents.BrandTeal);
                        BigKpi("Ausências", data.TotalAbsences.Value.ToString(), "#dc2626");
                        BigKpi("Atrasos", data.TotalLateEvents.Value.ToString(), "#b45309");
                        BigKpi("Contratos no SLA", $"{data.ContractsInSla.InSla}/{data.ContractsInSla.Total}", "#16a34a");
                    });
                    root.Item().PageBreak();

                    // ── Slide 3 — SLA por contrato ─────────────────────────
                    root.Item().Text("Cumprimento de SLA por contrato").FontSize(28).Bold();
                    if (data.Contracts.Count == 0)
                    {
                        root.Item().PaddingTop(20).Text("Nenhum contrato cadastrado.").FontSize(16).FontColor(SharedComponents.TextMuted);
                    }
                    else
                    {
                        root.Item().PaddingTop(16).Table(table =>
                        {
                            table.ColumnsDefinition(c => { c.RelativeColumn(4); c.RelativeColumn(); c.RelativeColumn(); c.RelativeColumn(2); });
                            table.Header(header =>
                            {
                                void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(8)
                                    .Text(t).FontColor(Colors.White).FontSize(13).SemiBold();
                                H("Contrato / Órgão"); H("SLA"); H("Meta"); H("Status");
                            });
                            foreach (var c in data.Contracts)
                            {
                                void Cell(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor).Padding(8).Text(t).FontSize(13);
                                Cell($"{c.PublicOrganName}  ·  {c.ContractNumber}");
                                Cell(SharedComponents.Percent(c.SlaPercent));
                                Cell(SharedComponents.Percent(c.TargetPercent));
                                Cell(StatusLabel(c.Status));
                            }
                        });
                    }
                    root.Item().PageBreak();

                    // ── Slide 4 — ranking + ocorrências ────────────────────
                    root.Item().Text("Ranking de UPAs e ocorrências").FontSize(28).Bold();
                    root.Item().PaddingTop(16).Row(row =>
                    {
                        row.Spacing(24);
                        row.RelativeItem().Column(col =>
                        {
                            col.Item().Text("Melhores UPAs por SLA").FontSize(16).SemiBold();
                            if (data.ClinicRanking.Count == 0)
                                col.Item().Text("Sem dados.").FontSize(13).FontColor(SharedComponents.TextMuted);
                            foreach (var r in data.ClinicRanking.OrderBy(x => x.Position).Take(5))
                                col.Item().PaddingTop(6).Text($"{r.Position}. {r.ClinicName} — {SharedComponents.Percent(r.SlaPercent)}").FontSize(14);
                        });
                        row.RelativeItem().Column(col =>
                        {
                            col.Item().Text("Profissionais com mais ocorrências").FontSize(16).SemiBold();
                            if (data.ProblemDoctors.Count == 0)
                                col.Item().Text("Sem dados.").FontSize(13).FontColor(SharedComponents.TextMuted);
                            foreach (var d in data.ProblemDoctors.Take(5))
                                col.Item().PaddingTop(6).Text($"{d.UserName} — {d.OccurrenceCount} ocorr. ({d.AbsenceCount} aus. / {d.LateCount} atr.)").FontSize(14);
                        });
                    });

                    // ── Slide 5 — destaques ────────────────────────────────
                    if (data.Highlights.Count > 0)
                    {
                        root.Item().PageBreak();
                        root.Item().Text("Destaques para reunião").FontSize(28).Bold();
                        root.Item().PaddingTop(16).Column(list =>
                        {
                            list.Spacing(10);
                            foreach (var h in data.Highlights)
                                list.Item().Text($"{HighlightMark(h.Kind)}  {h.Text}").FontSize(15);
                        });
                    }
                });
            });
        }).GeneratePdf();
    }

    private static string StatusLabel(string status) => status switch
    {
        "ok" => "No SLA",
        "warn" => "Atenção",
        "crit" => "Crítico",
        _ => status,
    };

    private static string HighlightMark(string kind) => kind switch
    {
        "pos" => "[+]",
        "neg" => "[-]",
        _ => "[•]",
    };
}
