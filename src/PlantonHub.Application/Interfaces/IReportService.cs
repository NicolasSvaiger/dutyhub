using PlantonHub.Application.Reports;

namespace PlantonHub.Application.Interfaces;

/// <summary>
/// Orquestra a geração de relatórios do portal Prefeitura: (1) escolhe
/// o <see cref="IReportGenerator"/> pelo (type, format), (2) busca o
/// payload agregado via <see cref="IPrefeituraService"/> — mesmo escopo
/// dos endpoints de leitura, sem duplicação de query, (3) retorna bytes
/// + ContentType + filename pronto. Ver design.md § "Exportação PDF/Excel".
/// </summary>
public interface IReportService
{
    /// <summary>
    /// Tamanho máximo aceitável do binário antes de recusar. Definido em
    /// bytes — 5 MB é o valor sinalizado no design.md. Guarda contra
    /// gerações fora de controle (dataset gigante).
    /// </summary>
    long MaxOutputBytes { get; }

    Task<GeneratedReport> GenerateAsync(ReportRequest request, CancellationToken ct = default);
}

/// <summary>Resultado bruto pronto para <c>File(bytes, contentType, filename)</c>.</summary>
public sealed record GeneratedReport(byte[] Bytes, string ContentType, string FileName);
