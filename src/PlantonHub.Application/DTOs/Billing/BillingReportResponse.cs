namespace PlantonHub.Application.DTOs.Billing;

public class BillingReportResponse
{
    public int Year { get; set; }
    public int Month { get; set; }

    // ── KPIs agregados ─────────────────────────────────────────────────────

    /// <summary>Soma dos MonthlyValue de todos os contratos considerados no período.</summary>
    public decimal TotalRevenue { get; set; }

    /// <summary>Horas efetivamente trabalhadas (soma checkout-checkin dos attendances).</summary>
    public decimal TotalHours { get; set; }

    /// <summary>Total de plantões previstos (ShiftAssignments) no período.</summary>
    public int TotalShiftsPlanned { get; set; }

    /// <summary>Total de plantões cumpridos (com attendance registrado) no período.</summary>
    public int TotalShiftsFulfilled { get; set; }

    /// <summary>Total descontado por plantões não cumpridos.</summary>
    public decimal TotalDiscount { get; set; }

    /// <summary>Valor líquido a pagar após deduções (TotalRevenue - TotalDiscount).</summary>
    public decimal NetPayable { get; set; }

    /// <summary>Percentual global de cumprimento (0-100).</summary>
    public decimal FulfillmentPercent { get; set; }

    // ── Blocos ──────────────────────────────────────────────────────────────

    public List<ContractBillingSummary> Contracts { get; set; } = new();
    public List<ClinicHoursSummary> ClinicHours { get; set; } = new();
    public List<DoctorBillingRow> Doctors { get; set; } = new();
}

public class ContractBillingSummary
{
    public Guid ContractId { get; set; }
    public string ContractNumber { get; set; } = string.Empty;
    public Guid PublicOrganId { get; set; }
    public string PublicOrganName { get; set; } = string.Empty;
    public decimal MonthlyValue { get; set; }
    public int ClinicCount { get; set; }
    public int ShiftsPlanned { get; set; }
    public int ShiftsFulfilled { get; set; }
    public decimal FulfillmentPercent { get; set; }
    public decimal Discount { get; set; }
    public decimal NetPayable { get; set; }
}

public class ClinicHoursSummary
{
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public decimal Hours { get; set; }
}

public class DoctorBillingRow
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }
    public Guid ClinicId { get; set; }
    public string ClinicName { get; set; } = string.Empty;
    public int ShiftsPlanned { get; set; }
    public int ShiftsFulfilled { get; set; }
    public decimal HoursWorked { get; set; }
    public decimal FulfillmentPercent { get; set; }
    public decimal GrossAmount { get; set; }
    public decimal Discount { get; set; }
    public decimal NetAmount { get; set; }
}
