using PlantonHub.Application.DTOs.Audit;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace PlantonHub.Application.Reports.Pdf;

/// <summary>
/// PDF da Auditoria — timeline de eventos filtrada, em paisagem. Payload:
/// lista de <see cref="AuditLogEntry"/> (já filtrada/limitada pelo controller).
/// </summary>
public class AuditLogPdfGenerator : IReportGenerator
{
    public ReportType Type => ReportType.AuditLog;
    public ReportFormat Format => ReportFormat.Pdf;
    public string ContentType => "application/pdf";
    public string FileExtension => "pdf";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not IReadOnlyList<AuditLogEntry> data)
            throw new ArgumentException("Payload precisa ser IReadOnlyList<AuditLogEntry>", nameof(payload));

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(30);
                page.Header().Element(c => SharedComponents.ComposeHeader(c, "Auditoria — Logs", DateTime.UtcNow));
                page.Content().Column(col =>
                {
                    col.Spacing(10);

                    // Filtros aplicados (transparência do que foi exportado).
                    var filtros = new List<string> { $"Período: {request.From:dd/MM/yyyy} → {request.To:dd/MM/yyyy}" };
                    if (!string.IsNullOrWhiteSpace(request.Filter)) filtros.Add($"Módulo: {request.Filter}");
                    if (!string.IsNullOrWhiteSpace(request.Search)) filtros.Add($"Busca: {request.Search}");
                    filtros.Add($"{data.Count} evento(s)");
                    col.Item().Background(Colors.Grey.Lighten4).Padding(8).Column(f =>
                    {
                        foreach (var line in filtros)
                            f.Item().Text(line).FontSize(9).FontColor(SharedComponents.TextMuted);
                    });

                    if (data.Count == 0)
                    {
                        col.Item().Text("Nenhum evento no período/filtro.").FontColor(SharedComponents.TextMuted).FontSize(10);
                        return;
                    }

                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(2);  // data/hora
                            c.RelativeColumn(2);  // usuário
                            c.RelativeColumn(2);  // operação
                            c.RelativeColumn(2);  // módulo
                            c.RelativeColumn(2);  // entidade
                            c.RelativeColumn(4);  // ação
                            c.RelativeColumn(2);  // IP
                        });

                        table.Header(header =>
                        {
                            void H(string t) => header.Cell().Background(SharedComponents.BrandTeal).Padding(5)
                                .Text(t).FontColor(Colors.White).FontSize(9).SemiBold();
                            H("Data / Hora");
                            H("Usuário");
                            H("Operação");
                            H("Módulo");
                            H("Entidade");
                            H("Ação");
                            H("IP");
                        });

                        foreach (var e in data)
                        {
                            void Cell(string t) => table.Cell().Border(1).BorderColor(SharedComponents.BorderColor)
                                .Padding(4).Text(t).FontSize(8);
                            Cell($"{e.DateLabel} {e.TimeLabel}");
                            Cell(string.IsNullOrEmpty(e.UserRole) ? e.UserName : $"{e.UserName}\n({e.UserRole})");
                            Cell(e.OperationLabel);
                            Cell(e.Module ?? "—");
                            Cell(string.IsNullOrEmpty(e.EntityId) ? e.Entity : $"{e.Entity} · {e.EntityId}");
                            Cell(e.Action);
                            Cell(e.IpAddress ?? "—");
                        }
                    });
                });
                page.Footer().Element(SharedComponents.ComposeFooter);
            });
        }).GeneratePdf();
    }
}
