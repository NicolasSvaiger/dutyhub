using ClosedXML.Excel;
using PlantonHub.Application.DTOs.Prefeitura;

namespace PlantonHub.Application.Reports.Excel;

/// <summary>Excel do relatório de Histórico consolidado.</summary>
public class HistoryExcelGenerator : IReportGenerator
{
    public ReportType Type => ReportType.History;
    public ReportFormat Format => ReportFormat.Xlsx;
    public string ContentType => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public string FileExtension => "xlsx";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not PrefeituraHistoryPage data)
            throw new ArgumentException("Payload precisa ser PrefeituraHistoryPage", nameof(payload));

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Histórico");

        ws.Cell(1, 1).Value = "Relatório de Histórico — Prefeitura";
        ws.Range(1, 1, 1, 5).Merge().Style.Font.SetBold().Font.SetFontSize(14);
        ws.Cell(2, 1).Value = $"Período: {request.From:dd/MM/yyyy} → {request.To:dd/MM/yyyy}";
        ws.Range(2, 1, 2, 5).Merge().Style.Font.SetItalic();

        var header = new[] { "Data/hora", "Tipo", "Descrição", "Profissional", "UPA" };
        for (var i = 0; i < header.Length; i++)
        {
            var cell = ws.Cell(4, i + 1);
            cell.Value = header[i];
            cell.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#2DBFB8"));
            cell.Style.Font.SetFontColor(XLColor.White).Font.SetBold();
        }

        var row = 5;
        foreach (var item in data.Items)
        {
            ws.Cell(row, 1).Value = item.Timestamp;
            ws.Cell(row, 1).Style.DateFormat.Format = "dd/MM/yyyy HH:mm";
            ws.Cell(row, 2).Value = item.Type;
            ws.Cell(row, 3).Value = item.Title;
            ws.Cell(row, 4).Value = item.UserName ?? "—";
            ws.Cell(row, 5).Value = item.ClinicName ?? "—";
            row++;
        }

        ws.Columns().AdjustToContents();
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }
}
