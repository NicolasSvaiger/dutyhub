using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Reports;

namespace PlantonHub.Application.Services;

/// <summary>
/// Orquestra a geração de relatórios do portal Prefeitura:
///   1. Busca o payload agregado via <see cref="IPrefeituraService"/> —
///      mesma pipeline dos endpoints de leitura, sem duplicação de query.
///   2. Escolhe o <see cref="IReportGenerator"/> registrado que casa com
///      (type, format) informados.
///   3. Gera bytes + verifica limite de tamanho (design.md § 5MB) e
///      monta filename (ex.: <c>ausencias-2026-07-17.pdf</c>).
/// Ver design.md § "Exportação PDF/Excel".
/// </summary>
public class ReportService : IReportService
{
    // 5 MB — sinalizado no design.md. Aumentar aqui exige revisar a UX
    // (frontend precisa avisar o usuário antes de tentar gerar).
    public long MaxOutputBytes => 5 * 1024 * 1024;

    private readonly IPrefeituraService _prefeituraService;
    private readonly IReadOnlyList<IReportGenerator> _generators;

    public ReportService(IPrefeituraService prefeituraService, IEnumerable<IReportGenerator> generators)
    {
        _prefeituraService = prefeituraService;
        _generators = generators.ToList();
    }

    public async Task<GeneratedReport> GenerateAsync(ReportRequest request, CancellationToken ct = default)
    {
        // 1) Encontra o generator. Se não existe pra (type, format), 400 —
        //    o controller ainda valida antes de chegar aqui, mas o service
        //    tem sua própria garantia (útil pra testes e chamadas internas).
        var generator = _generators.FirstOrDefault(g => g.Type == request.Type && g.Format == request.Format)
            ?? throw new BadRequestException(
                $"Não há relatório {request.Type} disponível no formato {request.Format}.");

        // 2) Busca o payload agregado — mesma pipeline dos endpoints read.
        //    Cada report type consome o DTO correspondente.
        object payload = request.Type switch
        {
            ReportType.Kpis => await _prefeituraService.GetKpisAsync(request.From, request.To, ct),
            ReportType.Frequency => await _prefeituraService.GetFrequencyAsync(
                request.From, request.To, request.ClinicId, ct),
            ReportType.Atrasos => await _prefeituraService.GetAbsencesAsync(
                request.From, request.To, "late", ct),
            ReportType.Ausencias => await _prefeituraService.GetAbsencesAsync(
                request.From, request.To, "absence", ct),
            ReportType.History => await _prefeituraService.GetHistoryAsync(
                request.From, request.To, request.Filter, request.Search,
                page: 1, pageSize: 500, ct),
            _ => throw new BadRequestException($"Tipo de relatório não suportado: {request.Type}"),
        };

        // 3) Gera os bytes.
        var bytes = generator.Generate(payload, request);

        // 4) Guarda de tamanho — evita transferir binário fora de controle.
        if (bytes.Length > MaxOutputBytes)
        {
            throw new PayloadTooLargeException(
                $"O relatório gerado excede o limite de {MaxOutputBytes / 1024 / 1024} MB. Reduza o período ou filtre por UPA.");
        }

        var filename = $"{request.Type.ToString().ToLowerInvariant()}-{request.From:yyyy-MM-dd}.{generator.FileExtension}";
        return new GeneratedReport(bytes, generator.ContentType, filename);
    }
}
