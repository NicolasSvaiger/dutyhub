namespace PlantonHub.Application.Reports;

/// <summary>
/// Contrato de um gerador específico (tipo × formato). Cada implementação
/// converte um payload já-agregado do <c>PrefeituraService</c> em bytes
/// binários prontos pra download. Payload é <c>object</c> pra suportar
/// os 5 tipos com DTOs diferentes; cada gerador faz cast pro tipo esperado.
/// </summary>
public interface IReportGenerator
{
    ReportType Type { get; }
    ReportFormat Format { get; }

    /// <summary>MIME type do output — vai no Content-Type da resposta HTTP.</summary>
    string ContentType { get; }

    /// <summary>Sufixo do arquivo (sem ponto), ex.: "pdf", "xlsx".</summary>
    string FileExtension { get; }

    /// <summary>Sync — geração de PDF/Excel é CPU-bound; sem I/O externo.</summary>
    byte[] Generate(object payload, ReportRequest request);
}
