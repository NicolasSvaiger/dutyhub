using PlantonHub.Application.DTOs.Billing;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace PlantonHub.Application.Reports.Pdf;

/// <summary>
/// PDF do relatório de Faturamento do Admin/OS — KPIs financeiros do mês,
/// detalhamento por contrato, horas por UPA e faturamento por médico.
/// Paisagem por conta das tabelas largas. Payload esperado:
/// <see cref="BillingReportResponse"/>.
/// </summary>
public class BillingPdfGenerator : IReportGenerator
{
    public ReportType Type => ReportType.Billing;
    public ReportFormat Format => ReportFormat.Pdf;
    public string ContentType => "application/pdf";
    public string FileExtension => "pdf";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not BillingReportResponse data)
            throw new ArgumentException("Payload precisa ser BillingReportResponse", nameof(payload));

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(30);
                page.Header().Element(c => SharedComponents.ComposeHeader(c, "Relatório de Faturamento — OS", DateTime.UtcNow));
                page.Content().Column(col =>
                {
                    col.Spacing(12);

                    col.Item().Background(Colors.Grey.Lighten4).Padding(8)
                       .Text($"Período: {data.Month:00}/{data.Year}").FontSize(9).FontColor(SharedComponents.TextMuted);

                    // ── KPIs financeiros ───────────────────────────────────
                    col.Item().Text("Resumo financeiro").SemiBold().FontSize(12);
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

                        Kpi("Receita bruta", SharedComponents.MoneyBRL(data.TotalRevenue));
                        Kpi("Descontos", SharedComponents.MoneyBRL(data.TotalDiscount));
                        Kpi("Líquido a pagar", SharedComponents.MoneyBRL(data.NetPayable));
                        Kpi("Cumprimento", SharedComponents.Percent(data.FulfillmentPercent));
                        Kpi("Horas trabalhadas", SharedComponents.Decimal1(data.TotalHours) + "h");
                        Kpi("Plantões previstos", data.TotalShiftsPlanned.ToString());
                        Kpi("Plantões cumpridos", data.TotalShiftsFulfilled.ToString());
                        Kpi("Contratos", data.Contracts.Count.ToString());
                    });

                    // ── Por contrato ───────────────────────────────────────
                    col.Item().PaddingTop(6).Text("Faturamento por contrato").SemiBold().FontSize(12);
                    if (data.Contracts.Count == 0)
                    {
                        col.Item().Text("Nenhum contrato no período.").FontColor(SharedComponents.TextMuted).FontSize(9);
                    }
                    else
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3); // contrato/órgão
                                c.RelativeColumn(2); // valor mensal
                                c.RelativeColumn();  // UPAs
                                c.RelativeColumn();  // previstos
                                c.RelativeColumn();  // cumpridos
                                c.RelativeColumn();  // cumprim.%
                                c.RelativeColumn(2); // desconto
                                c.RelativeColumn(2); // líquido
                            });
                            table.Header(header =>
                            {
                                void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                    .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                                H("Contrato / Órgão");
                                H("Valor mensal");
                                H("UPAs");
                                H("Prev.");
                                H("Cumpr.");
                                H("%");
                                H("Desconto");
                                H("Líquido");
                            });
                            foreach (var c in data.Contracts)
                            {
                                void Cell(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                    .Padding(5).Text(t).FontSize(9);
                                Cell($"{c.PublicOrganName}\n{c.ContractNumber}");
                                Cell(SharedComponents.MoneyBRL(c.MonthlyValue));
                                Cell(c.ClinicCount.ToString());
                                Cell(c.ShiftsPlanned.ToString());
                                Cell(c.ShiftsFulfilled.ToString());
                                Cell(SharedComponents.Percent(c.FulfillmentPercent));
                                Cell(SharedComponents.MoneyBRL(c.Discount));
                                Cell(SharedComponents.MoneyBRL(c.NetPayable));
                            }
                        });
                    }

                    // ── Horas por UPA ──────────────────────────────────────
                    if (data.ClinicHours.Count > 0)
                    {
                        col.Item().PaddingTop(6).Text("Horas por UPA").SemiBold().FontSize(12);
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(4);
                                c.RelativeColumn();
                            });
                            table.Header(header =>
                            {
                                void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                    .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                                H("UPA");
                                H("Horas");
                            });
                            foreach (var ch in data.ClinicHours)
                            {
                                void Cell(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                    .Padding(5).Text(t).FontSize(9);
                                Cell(ch.ClinicName);
                                Cell(SharedComponents.Decimal1(ch.Hours) + "h");
                            }
                        });
                    }

                    // ── Por médico ─────────────────────────────────────────
                    if (data.Doctors.Count > 0)
                    {
                        col.Item().PaddingTop(6).Text("Faturamento por profissional").SemiBold().FontSize(12);
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3); // nome
                                c.RelativeColumn(2); // registro
                                c.RelativeColumn(2); // UPA
                                c.RelativeColumn();  // prev
                                c.RelativeColumn();  // cumpr
                                c.RelativeColumn();  // horas
                                c.RelativeColumn(2); // bruto
                                c.RelativeColumn(2); // desconto
                                c.RelativeColumn(2); // líquido
                            });
                            table.Header(header =>
                            {
                                void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                    .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                                H("Profissional");
                                H("Registro");
                                H("UPA");
                                H("Prev.");
                                H("Cumpr.");
                                H("Horas");
                                H("Bruto");
                                H("Desconto");
                                H("Líquido");
                            });
                            foreach (var d in data.Doctors)
                            {
                                void Cell(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                    .Padding(5).Text(t).FontSize(8);
                                Cell(d.UserName);
                                Cell(d.RegistrationNumber ?? "—");
                                Cell(d.ClinicName);
                                Cell(d.ShiftsPlanned.ToString());
                                Cell(d.ShiftsFulfilled.ToString());
                                Cell(SharedComponents.Decimal1(d.HoursWorked) + "h");
                                Cell(SharedComponents.MoneyBRL(d.GrossAmount));
                                Cell(SharedComponents.MoneyBRL(d.Discount));
                                Cell(SharedComponents.MoneyBRL(d.NetAmount));
                            }
                        });
                    }
                });
                page.Footer().Element(SharedComponents.ComposeFooter);
            });
        }).GeneratePdf();
    }
}
