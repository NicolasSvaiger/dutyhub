using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace PlantonHub.Application.Reports.Pdf;

/// <summary>
/// Fragmentos QuestPDF reutilizados nos 5 templates PDF do portal
/// Prefeitura. Concentra header + footer + tabela de filtros pra
/// evitar duplicação e manter identidade visual consistente.
/// </summary>
internal static class SharedComponents
{
    public const string BrandTeal = "#2DBFB8";
    public const string TextMuted = "#7a9090";
    public const string BorderColor = "#E0EFEE";

    /// <summary>
    /// Cabeçalho padrão: nome do relatório + data de geração + logo textual "24p7".
    /// </summary>
    public static void ComposeHeader(IContainer container, string title, DateTime generatedAt)
    {
        container.Row(row =>
        {
            row.RelativeItem().Column(col =>
            {
                col.Item().Text(title).FontSize(18).SemiBold();
                col.Item().Text($"Gerado em {generatedAt:dd/MM/yyyy HH:mm}").FontColor(TextMuted).FontSize(9);
            });

            row.ConstantItem(80).AlignRight().Text("24p7")
               .FontSize(16).Bold().FontColor(BrandTeal);
        });
    }

    /// <summary>
    /// Rodapé padrão: paginação. O ano/rodapé institucional fica no header
    /// pra deixar o footer limpo (evita quebra estranha em relatórios curtos).
    /// </summary>
    public static void ComposeFooter(IContainer container)
    {
        container.AlignRight().Text(txt =>
        {
            txt.DefaultTextStyle(TextStyle.Default.FontSize(9).FontColor(TextMuted));
            txt.Span("Página ");
            txt.CurrentPageNumber();
            txt.Span(" de ");
            txt.TotalPages();
        });
    }

    /// <summary>
    /// Bloco pequeno mostrando os filtros aplicados (from/to/clinic/etc)
    /// para dar transparência ao imprimir/enviar. Aparece logo abaixo do header.
    /// </summary>
    public static void ComposeFilters(IContainer container, ReportRequest request, string? clinicName)
    {
        var lines = new List<string>
        {
            $"Período: {request.From:dd/MM/yyyy} → {request.To:dd/MM/yyyy}",
        };
        if (!string.IsNullOrEmpty(clinicName))
        {
            lines.Add($"UPA: {clinicName}");
        }
        if (!string.IsNullOrWhiteSpace(request.Filter))
        {
            lines.Add($"Filtro: {request.Filter}");
        }
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            lines.Add($"Busca: {request.Search}");
        }

        container.Background(Colors.Grey.Lighten4).Padding(8).Column(col =>
        {
            foreach (var line in lines)
            {
                col.Item().Text(line).FontSize(9).FontColor(TextMuted);
            }
        });
    }
}
