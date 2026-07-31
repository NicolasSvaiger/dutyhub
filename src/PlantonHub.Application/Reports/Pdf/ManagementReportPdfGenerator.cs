using PlantonHub.Application.DTOs.ManagementReport;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace PlantonHub.Application.Reports.Pdf;

/// <summary>
/// PDF do relatório Gerencial do Admin/OS — visão executiva mensal: KPIs de
/// SLA/ausências/atrasos, cumprimento por contrato, ranking de UPAs, médicos
/// com mais ocorrências e destaques para reunião. Payload esperado:
/// <see cref="ManagementReportResponse"/>.
/// </summary>
public class ManagementReportPdfGenerator : IReportGenerator
{
    public ReportType Type => ReportType.ManagementReport;
    public ReportFormat Format => ReportFormat.Pdf;
    public string ContentType => "application/pdf";
    public string FileExtension => "pdf";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not ManagementReportResponse data)
            throw new ArgumentException("Payload precisa ser ManagementReportResponse", nameof(payload));

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.Header().Element(c => SharedComponents.ComposeHeader(c, "Relatório Gerencial — OS", DateTime.UtcNow));
                page.Content().Column(col =>
                {
                    col.Spacing(12);

                    var periodo = string.IsNullOrWhiteSpace(data.PeriodLabel)
                        ? $"{data.Month:00}/{data.Year}"
                        : data.PeriodLabel;
                    col.Item().Background(Colors.Grey.Lighten4).Padding(8)
                       .Text($"Período: {periodo}").FontSize(9).FontColor(SharedComponents.TextMuted);

                    // ── KPIs do período ────────────────────────────────────
                    col.Item().Text("Indicadores do período").SemiBold().FontSize(12);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn();
                            c.RelativeColumn();
                            c.RelativeColumn();
                            c.RelativeColumn();
                        });

                        void Kpi(string label, string value, string sub)
                        {
                            table.Cell().Border(1).BorderColor(SharedComponents.BorderColor).Padding(6).Column(c =>
                            {
                                c.Item().Text(label).FontSize(8).FontColor(SharedComponents.TextMuted);
                                c.Item().PaddingTop(2).Text(value).FontSize(14).SemiBold();
                                if (!string.IsNullOrEmpty(sub))
                                    c.Item().Text(sub).FontSize(7).FontColor(SharedComponents.TextMuted);
                            });
                        }

                        Kpi("SLA global OS", SharedComponents.Percent(data.SlaGlobal.Value), data.SlaGlobal.Label);
                        Kpi("Total de ausências", data.TotalAbsences.Value.ToString(), data.TotalAbsences.Label);
                        Kpi("Atrasos registrados", data.TotalLateEvents.Value.ToString(), data.TotalLateEvents.Label);
                        Kpi("Contratos no SLA", $"{data.ContractsInSla.InSla} / {data.ContractsInSla.Total}", data.ContractsInSla.Label);
                    });

                    // ── SLA por contrato ───────────────────────────────────
                    col.Item().PaddingTop(6).Text("Cumprimento de SLA por contrato").SemiBold().FontSize(12);
                    if (data.Contracts.Count == 0)
                    {
                        col.Item().Text("Nenhum contrato cadastrado.").FontColor(SharedComponents.TextMuted).FontSize(9);
                    }
                    else
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3); // órgão/contrato
                                c.RelativeColumn();   // SLA
                                c.RelativeColumn();   // meta
                                c.RelativeColumn();   // UPAs
                                c.RelativeColumn();   // ausências
                                c.RelativeColumn(2);  // status
                            });

                            table.Header(header =>
                            {
                                void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                    .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                                H("Contrato / Órgão");
                                H("SLA");
                                H("Meta");
                                H("UPAs");
                                H("Ausências");
                                H("Status");
                            });

                            foreach (var c in data.Contracts)
                            {
                                void Cell(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                    .Padding(5).Text(t).FontSize(9);
                                Cell($"{c.PublicOrganName}\n{c.ContractNumber}");
                                Cell(SharedComponents.Percent(c.SlaPercent));
                                Cell(SharedComponents.Percent(c.TargetPercent));
                                Cell(c.ClinicCount.ToString());
                                Cell(c.AbsenceCount.ToString());
                                Cell(StatusLabel(c.Status));
                            }
                        });
                    }

                    // ── Ranking de UPAs ────────────────────────────────────
                    if (data.ClinicRanking.Count > 0)
                    {
                        col.Item().PaddingTop(6).Text("Ranking de UPAs por SLA").SemiBold().FontSize(12);
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(30);
                                c.RelativeColumn(4);
                                c.RelativeColumn();
                            });
                            table.Header(header =>
                            {
                                void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                    .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                                H("#");
                                H("UPA");
                                H("SLA");
                            });
                            foreach (var r in data.ClinicRanking.OrderBy(x => x.Position))
                            {
                                void Cell(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                    .Padding(5).Text(t).FontSize(9);
                                Cell(r.Position.ToString());
                                Cell(r.ClinicName);
                                Cell(SharedComponents.Percent(r.SlaPercent));
                            }
                        });
                    }

                    // ── Médicos com mais ocorrências ───────────────────────
                    if (data.ProblemDoctors.Count > 0)
                    {
                        col.Item().PaddingTop(6).Text("Profissionais com mais ocorrências").SemiBold().FontSize(12);
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3);
                                c.RelativeColumn(2);
                                c.RelativeColumn();
                                c.RelativeColumn();
                                c.RelativeColumn();
                            });
                            table.Header(header =>
                            {
                                void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                    .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                                H("Profissional");
                                H("UPA");
                                H("Ocorr.");
                                H("Ausências");
                                H("Atrasos");
                            });
                            foreach (var d in data.ProblemDoctors)
                            {
                                void Cell(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                    .Padding(5).Text(t).FontSize(9);
                                Cell(d.UserName);
                                Cell(d.ClinicName ?? "—");
                                Cell(d.OccurrenceCount.ToString());
                                Cell(d.AbsenceCount.ToString());
                                Cell(d.LateCount.ToString());
                            }
                        });
                    }

                    // ── Destaques para reunião ─────────────────────────────
                    if (data.Highlights.Count > 0)
                    {
                        col.Item().PaddingTop(6).Text("Destaques para reunião").SemiBold().FontSize(12);
                        col.Item().Column(list =>
                        {
                            list.Spacing(3);
                            foreach (var h in data.Highlights)
                            {
                                list.Item().Text($"{HighlightMark(h.Kind)} {h.Text}").FontSize(9);
                            }
                        });
                    }
                });
                page.Footer().Element(SharedComponents.ComposeFooter);
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
