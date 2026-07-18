using ClosedXML.Excel;
using PlantonHub.Application.DTOs.Prefeitura;

namespace PlantonHub.Application.Reports.Excel;

/// <summary>Excel do relatório de Frequência.</summary>
public class FrequencyExcelGenerator : IReportGenerator
{
    public ReportType Type => ReportType.Frequency;
    public ReportFormat Format => ReportFormat.Xlsx;
    public string ContentType => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public string FileExtension => "xlsx";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not IReadOnlyList<PrefeituraFrequencyItem> data)
            throw new ArgumentException("Payload precisa ser IReadOnlyList<PrefeituraFrequencyItem>", nameof(payload));

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Frequência");

        // Cabeçalho institucional em cima de tudo, mesma info do PDF.
        ws.Cell(1, 1).Value = "Relatório de Frequência — Prefeitura";
        ws.Range(1, 1, 1, 5).Merge().Style.Font.SetBold().Font.SetFontSize(14);
        ws.Cell(2, 1).Value = $"Período: {request.From:dd/MM/yyyy} → {request.To:dd/MM/yyyy}";
        ws.Range(2, 1, 2, 5).Merge().Style.Font.SetItalic();

        // Header da tabela.
        var header = new[] { "Data", "UPA", "Previsto", "Realizado", "Presença (%)" };
        for (var i = 0; i < header.Length; i++)
        {
            var cell = ws.Cell(4, i + 1);
            cell.Value = header[i];
            cell.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#2DBFB8"));
            cell.Style.Font.SetFontColor(XLColor.White).Font.SetBold();
        }

        // Rows.
        var row = 5;
        foreach (var item in data)
        {
            ws.Cell(row, 1).Value = item.Date;
            ws.Cell(row, 1).Style.DateFormat.Format = "dd/MM/yyyy";
            ws.Cell(row, 2).Value = item.ClinicName;
            ws.Cell(row, 3).Value = item.Expected;
            ws.Cell(row, 4).Value = item.Actual;
            ws.Cell(row, 5).Value = item.PresenceRate / 100.0;
            ws.Cell(row, 5).Style.NumberFormat.Format = "0.0%";
            row++;
        }

        ws.Columns().AdjustToContents();
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }
}
