using ClosedXML.Excel;
using PlantonHub.Application.DTOs.Audit;

namespace PlantonHub.Application.Reports.Excel;

/// <summary>
/// Excel da Auditoria — uma linha por evento, com todas as colunas (inclui
/// antes/depois). Payload: lista de <see cref="AuditLogEntry"/> já filtrada.
/// </summary>
public class AuditLogExcelGenerator : IReportGenerator
{
    public ReportType Type => ReportType.AuditLog;
    public ReportFormat Format => ReportFormat.Xlsx;
    public string ContentType => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public string FileExtension => "xlsx";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not IReadOnlyList<AuditLogEntry> data)
            throw new ArgumentException("Payload precisa ser IReadOnlyList<AuditLogEntry>", nameof(payload));

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Auditoria");

        ws.Cell(1, 1).Value = "Auditoria — Logs";
        ws.Range(1, 1, 1, 6).Merge().Style.Font.SetBold().Font.SetFontSize(14);
        ws.Cell(2, 1).Value = $"Período: {request.From:dd/MM/yyyy} → {request.To:dd/MM/yyyy} · {data.Count} evento(s)";
        ws.Range(2, 1, 2, 6).Merge().Style.Font.SetItalic();

        var header = new[] { "Data", "Hora", "Usuário", "Perfil", "Operação", "Módulo", "Entidade", "ID Entidade", "Ação", "Detalhes", "IP", "Antes", "Depois" };
        for (var i = 0; i < header.Length; i++)
        {
            var cell = ws.Cell(4, i + 1);
            cell.Value = header[i];
            cell.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#2DBFB8"));
            cell.Style.Font.SetFontColor(XLColor.White).Font.SetBold();
        }

        var row = 5;
        foreach (var e in data)
        {
            ws.Cell(row, 1).Value = e.DateLabel;
            ws.Cell(row, 2).Value = e.TimeLabel;
            ws.Cell(row, 3).Value = e.UserName;
            ws.Cell(row, 4).Value = e.UserRole ?? "";
            ws.Cell(row, 5).Value = e.OperationLabel;
            ws.Cell(row, 6).Value = e.Module ?? "";
            ws.Cell(row, 7).Value = e.Entity;
            ws.Cell(row, 8).Value = e.EntityId;
            ws.Cell(row, 9).Value = e.Action;
            ws.Cell(row, 10).Value = e.Details ?? "";
            ws.Cell(row, 11).Value = e.IpAddress ?? "";
            ws.Cell(row, 12).Value = e.BeforeValue ?? "";
            ws.Cell(row, 13).Value = e.AfterValue ?? "";
            row++;
        }

        ws.Columns().AdjustToContents();
        ws.SheetView.FreezeRows(4);

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }
}
