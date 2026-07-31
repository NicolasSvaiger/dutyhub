using ClosedXML.Excel;
using PlantonHub.Application.DTOs.Billing;

namespace PlantonHub.Application.Reports.Excel;

/// <summary>
/// Excel do relatório de Faturamento do Admin/OS. Planilhas: Resumo (KPIs),
/// Contratos, Horas por UPA e Médicos. Valores vão como números reais
/// (não texto) com formatos de moeda/percentual pra permitir soma/ordenação
/// no Excel. Payload esperado: <see cref="BillingReportResponse"/>.
/// </summary>
public class BillingExcelGenerator : IReportGenerator
{
    public ReportType Type => ReportType.Billing;
    public ReportFormat Format => ReportFormat.Xlsx;
    public string ContentType => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public string FileExtension => "xlsx";

    private const string Teal = "#2DBFB8";
    private const string MoneyFmt = "\"R$\" #,##0.00";
    private const string HoursFmt = "0.0";
    private const string PctFmt = "0.0%";

    public byte[] Generate(object payload, ReportRequest request)
    {
        if (payload is not BillingReportResponse data)
            throw new ArgumentException("Payload precisa ser BillingReportResponse", nameof(payload));

        using var wb = new XLWorkbook();

        BuildResumo(wb, data);
        BuildContratos(wb, data);
        BuildHorasPorUpa(wb, data);
        BuildMedicos(wb, data);

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static void StyleHeaderCell(IXLCell cell)
    {
        cell.Style.Fill.SetBackgroundColor(XLColor.FromHtml(Teal));
        cell.Style.Font.SetFontColor(XLColor.White).Font.SetBold();
    }

    private static void BuildResumo(XLWorkbook wb, BillingReportResponse data)
    {
        var ws = wb.Worksheets.Add("Resumo");
        ws.Cell(1, 1).Value = "Relatório de Faturamento — OS";
        ws.Range(1, 1, 1, 2).Merge().Style.Font.SetBold().Font.SetFontSize(14);
        ws.Cell(2, 1).Value = $"Período: {data.Month:00}/{data.Year}";
        ws.Range(2, 1, 2, 2).Merge().Style.Font.SetItalic();

        var row = 4;
        void Money(string label, decimal value)
        {
            ws.Cell(row, 1).Value = label;
            ws.Cell(row, 1).Style.Font.SetBold();
            ws.Cell(row, 2).Value = (double)value;
            ws.Cell(row, 2).Style.NumberFormat.Format = MoneyFmt;
            row++;
        }
        void Int(string label, int value)
        {
            ws.Cell(row, 1).Value = label;
            ws.Cell(row, 1).Style.Font.SetBold();
            ws.Cell(row, 2).Value = value;
            row++;
        }

        Money("Receita bruta", data.TotalRevenue);
        Money("Descontos", data.TotalDiscount);
        Money("Líquido a pagar", data.NetPayable);

        ws.Cell(row, 1).Value = "Cumprimento";
        ws.Cell(row, 1).Style.Font.SetBold();
        ws.Cell(row, 2).Value = (double)data.FulfillmentPercent / 100.0;
        ws.Cell(row, 2).Style.NumberFormat.Format = PctFmt;
        row++;

        ws.Cell(row, 1).Value = "Horas trabalhadas";
        ws.Cell(row, 1).Style.Font.SetBold();
        ws.Cell(row, 2).Value = (double)data.TotalHours;
        ws.Cell(row, 2).Style.NumberFormat.Format = HoursFmt;
        row++;

        Int("Plantões previstos", data.TotalShiftsPlanned);
        Int("Plantões cumpridos", data.TotalShiftsFulfilled);

        ws.Columns().AdjustToContents();
    }

    private static void BuildContratos(XLWorkbook wb, BillingReportResponse data)
    {
        var ws = wb.Worksheets.Add("Contratos");
        var header = new[] { "Contrato", "Órgão", "Valor mensal", "UPAs", "Previstos", "Cumpridos", "Cumprimento", "Desconto", "Líquido" };
        for (var i = 0; i < header.Length; i++)
        {
            ws.Cell(1, i + 1).Value = header[i];
            StyleHeaderCell(ws.Cell(1, i + 1));
        }

        var row = 2;
        foreach (var c in data.Contracts)
        {
            ws.Cell(row, 1).Value = c.ContractNumber;
            ws.Cell(row, 2).Value = c.PublicOrganName;
            ws.Cell(row, 3).Value = (double)c.MonthlyValue;
            ws.Cell(row, 3).Style.NumberFormat.Format = MoneyFmt;
            ws.Cell(row, 4).Value = c.ClinicCount;
            ws.Cell(row, 5).Value = c.ShiftsPlanned;
            ws.Cell(row, 6).Value = c.ShiftsFulfilled;
            ws.Cell(row, 7).Value = (double)c.FulfillmentPercent / 100.0;
            ws.Cell(row, 7).Style.NumberFormat.Format = PctFmt;
            ws.Cell(row, 8).Value = (double)c.Discount;
            ws.Cell(row, 8).Style.NumberFormat.Format = MoneyFmt;
            ws.Cell(row, 9).Value = (double)c.NetPayable;
            ws.Cell(row, 9).Style.NumberFormat.Format = MoneyFmt;
            row++;
        }

        ws.Columns().AdjustToContents();
    }

    private static void BuildHorasPorUpa(XLWorkbook wb, BillingReportResponse data)
    {
        var ws = wb.Worksheets.Add("Horas por UPA");
        ws.Cell(1, 1).Value = "UPA";
        ws.Cell(1, 2).Value = "Horas";
        StyleHeaderCell(ws.Cell(1, 1));
        StyleHeaderCell(ws.Cell(1, 2));

        var row = 2;
        foreach (var ch in data.ClinicHours)
        {
            ws.Cell(row, 1).Value = ch.ClinicName;
            ws.Cell(row, 2).Value = (double)ch.Hours;
            ws.Cell(row, 2).Style.NumberFormat.Format = HoursFmt;
            row++;
        }

        ws.Columns().AdjustToContents();
    }

    private static void BuildMedicos(XLWorkbook wb, BillingReportResponse data)
    {
        var ws = wb.Worksheets.Add("Médicos");
        var header = new[] { "Profissional", "Registro", "UPA", "Previstos", "Cumpridos", "Horas", "Cumprimento", "Bruto", "Desconto", "Líquido" };
        for (var i = 0; i < header.Length; i++)
        {
            ws.Cell(1, i + 1).Value = header[i];
            StyleHeaderCell(ws.Cell(1, i + 1));
        }

        var row = 2;
        foreach (var d in data.Doctors)
        {
            ws.Cell(row, 1).Value = d.UserName;
            ws.Cell(row, 2).Value = d.RegistrationNumber ?? "—";
            ws.Cell(row, 3).Value = d.ClinicName;
            ws.Cell(row, 4).Value = d.ShiftsPlanned;
            ws.Cell(row, 5).Value = d.ShiftsFulfilled;
            ws.Cell(row, 6).Value = (double)d.HoursWorked;
            ws.Cell(row, 6).Style.NumberFormat.Format = HoursFmt;
            ws.Cell(row, 7).Value = (double)d.FulfillmentPercent / 100.0;
            ws.Cell(row, 7).Style.NumberFormat.Format = PctFmt;
            ws.Cell(row, 8).Value = (double)d.GrossAmount;
            ws.Cell(row, 8).Style.NumberFormat.Format = MoneyFmt;
            ws.Cell(row, 9).Value = (double)d.Discount;
            ws.Cell(row, 9).Style.NumberFormat.Format = MoneyFmt;
            ws.Cell(row, 10).Value = (double)d.NetAmount;
            ws.Cell(row, 10).Style.NumberFormat.Format = MoneyFmt;
            row++;
        }

        ws.Columns().AdjustToContents();
    }
}
