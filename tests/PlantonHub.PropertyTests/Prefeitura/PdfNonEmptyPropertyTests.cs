using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using PlantonHub.Application.DTOs.Prefeitura;
using PlantonHub.Application.Reports;
using PlantonHub.Application.Reports.Pdf;

namespace PlantonHub.PropertyTests.Prefeitura;

/// <summary>
/// Sprint 7B — Property 4: PDF generators produzem bytes válidos.
///
/// Pra qualquer payload aceitável (mesmo com N=0 rows), o PDF gerado é
/// um arquivo PDF real — magic bytes <c>%PDF-</c> nos primeiros 5 bytes.
/// Alternativa ao teste de determinismo por hash (QuestPDF embute
/// timestamp de geração, que muda entre chamadas). O invariante forte
/// aqui é: mesma pipeline, mesmo formato de saída.
/// Validates: Requirements 11.1, 11.3.
/// </summary>
[Trait("Feature", "sprint-7-prefeitura")]
public class PdfNonEmptyPropertyTests
{
    static PdfNonEmptyPropertyTests()
    {
        // QuestPDF Community license — precisa ser declarada uma vez por AppDomain.
        QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
    }

    private static readonly byte[] PdfMagic = new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D }; // "%PDF-"

    private static ReportRequest Request() => new()
    {
        Type = ReportType.Kpis,
        Format = ReportFormat.Pdf,
        From = DateTime.UtcNow.AddDays(-7),
        To = DateTime.UtcNow,
    };

    [Property(MaxTest = 20)]
    public Property KpisPdf_AnyPayloadWithNClinics_ProducesValidPdfBytes()
    {
        return Prop.ForAll(
            Arb.From(Gen.Choose(0, 10)), // n clínicas no breakdown
            n =>
            {
                var payload = new PrefeituraKpisResponse
                {
                    GlobalComplianceRate = 85.5,
                    TotalExpectedShifts = n * 10,
                    TotalCoveredShifts = n * 8,
                    ByClinic = Enumerable.Range(0, n).Select(i => new PrefeituraKpiByClinic
                    {
                        ClinicId = Guid.NewGuid(),
                        ClinicName = $"UPA {i}",
                        ComplianceRate = 80 + i,
                        ExpectedShifts = 10,
                        CoveredShifts = 8,
                    }).ToList(),
                };

                var bytes = new KpisPdfGenerator().Generate(payload, Request());

                return (bytes.Length > PdfMagic.Length &&
                        bytes.Take(PdfMagic.Length).SequenceEqual(PdfMagic))
                    .ToProperty();
            });
    }

    [Property(MaxTest = 20)]
    public Property AusenciasPdf_AnyAbsenceList_ProducesValidPdfBytes()
    {
        return Prop.ForAll(
            Arb.From(Gen.Choose(0, 20)),
            n =>
            {
                var payload = (IReadOnlyList<PrefeituraAbsenceItem>)Enumerable.Range(0, n)
                    .Select(i => new PrefeituraAbsenceItem
                    {
                        Id = Guid.NewGuid(),
                        Type = "absence",
                        UserId = Guid.NewGuid(),
                        UserName = $"Dr {i}",
                        ClinicId = Guid.NewGuid(),
                        ClinicName = $"UPA {i}",
                        Date = DateTime.UtcNow.Date,
                        ShiftLabel = "Manhã (07:00–19:00)",
                    })
                    .ToList();

                var bytes = new AusenciasPdfGenerator().Generate(payload, Request());

                return (bytes.Length > PdfMagic.Length &&
                        bytes.Take(PdfMagic.Length).SequenceEqual(PdfMagic))
                    .ToProperty();
            });
    }
}
