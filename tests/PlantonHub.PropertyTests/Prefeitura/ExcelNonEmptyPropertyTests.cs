using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using PlantonHub.Application.DTOs.Prefeitura;
using PlantonHub.Application.Reports;
using PlantonHub.Application.Reports.Excel;

namespace PlantonHub.PropertyTests.Prefeitura;

/// <summary>
/// Sprint 7B — Property 5: Excel generators produzem workbook válido.
///
/// Xlsx é um ZIP OPC — magic bytes <c>PK</c> nos primeiros 2 bytes.
/// A pipeline ClosedXML → MemoryStream nunca pode retornar bytes vazios
/// nem lixo binário; qualquer regressão no template levaria a falha
/// visível no Excel/LibreOffice. Como os xlsx incorporam metadata com
/// timestamp, não testamos determinismo bit-a-bit — apenas a estrutura
/// mínima.
/// Validates: Requirements 11.1, 11.4.
/// </summary>
[Trait("Feature", "sprint-7-prefeitura")]
public class ExcelNonEmptyPropertyTests
{
    private static readonly byte[] ZipMagic = new byte[] { 0x50, 0x4B }; // "PK"

    private static ReportRequest Request() => new()
    {
        Type = ReportType.Frequency,
        Format = ReportFormat.Xlsx,
        From = DateTime.UtcNow.AddDays(-7),
        To = DateTime.UtcNow,
    };

    [Property(MaxTest = 20)]
    public Property FrequencyExcel_AnyRowCount_ProducesValidZipHeader()
    {
        return Prop.ForAll(
            Arb.From(Gen.Choose(0, 50)),
            n =>
            {
                var payload = (IReadOnlyList<PrefeituraFrequencyItem>)Enumerable.Range(0, n)
                    .Select(i => new PrefeituraFrequencyItem
                    {
                        ClinicId = Guid.NewGuid(),
                        ClinicName = $"UPA {i}",
                        Date = DateTime.UtcNow.Date.AddDays(-i),
                        Expected = 10,
                        Actual = 8,
                        PresenceRate = 80.0,
                    })
                    .ToList();

                var bytes = new FrequencyExcelGenerator().Generate(payload, Request());

                return (bytes.Length > ZipMagic.Length &&
                        bytes.Take(ZipMagic.Length).SequenceEqual(ZipMagic))
                    .ToProperty();
            });
    }

    [Property(MaxTest = 20)]
    public Property AusenciasExcel_AnyPayload_ProducesValidZipHeader()
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
                        ShiftLabel = "Manhã",
                    })
                    .ToList();

                var bytes = new AusenciasExcelGenerator().Generate(payload, Request());

                return (bytes.Length > ZipMagic.Length &&
                        bytes.Take(ZipMagic.Length).SequenceEqual(ZipMagic))
                    .ToProperty();
            });
    }
}
