using ClosedXML.Excel;
using PlantonHub.Application.DTOs.Prefeitura;

namespace PlantonHub.Application.Reports.Excel;

/// <summary>Excel do relatório de Atrasos.</summary>
public class AtrasosExcelGenerator : IReportGenerator
{
    public ReportType Type => ReportType.Atrasos;
    public ReportFormat Format => ReportFormat.Xlsx;
    public string ContentType => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public string FileExtension => "xlsx";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not IReadOnlyList<PrefeituraAbsenceItem> data)
            throw new ArgumentException("Payload precisa ser IReadOnlyList<PrefeituraAbsenceItem>", nameof(payload));

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Atrasos");

        ws.Cell(1, 1).Value = "Relatório de Atrasos — Prefeitura";
        ws.Range(1, 1, 1, 6).Merge().Style.Font.SetBold().Font.SetFontSize(14);
        ws.Cell(2, 1).Value = $"Período: {request.From:dd/MM/yyyy} → {request.To:dd/MM/yyyy}";
        ws.Range(2, 1, 2, 6).Merge().Style.Font.SetItalic();

        var header = new[] { "Data", "Profissional", "UPA", "Turno", "Atraso (min)", "Justificado" };
        for (var i = 0; i < header.Length; i++)
        {
            var cell = ws.Cell(4, i + 1);
            cell.Value = header[i];
            cell.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#2DBFB8"));
            cell.Style.Font.SetFontColor(XLColor.White).Font.SetBold();
        }

        var lateOnly = data.Where(i => i.Type == "late");
        var row = 5;
        foreach (var item in lateOnly)
        {
            ws.Cell(row, 1).Value = item.Date;
            ws.Cell(row, 1).Style.DateFormat.Format = "dd/MM/yyyy";
            ws.Cell(row, 2).Value = item.UserName;
            ws.Cell(row, 3).Value = item.ClinicName;
            ws.Cell(row, 4).Value = item.ShiftLabel;
            ws.Cell(row, 5).Value = item.MinutesLate ?? 0;
            ws.Cell(row, 6).Value = item.Justified ? "Sim" : "Não";
            row++;
        }

        ws.Columns().AdjustToContents();
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }
}
