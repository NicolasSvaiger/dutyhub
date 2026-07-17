using PlantonHub.Application.DTOs.Billing;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

public class BillingService : IBillingService
{
    private readonly IShiftRepository _shiftRepo;
    private readonly IAttendanceRepository _attendanceRepo;
    private readonly IContractRepository _contractRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IUserRepository _userRepo;
    private readonly ITenantService _tenant;

    public BillingService(
        IShiftRepository shiftRepo,
        IAttendanceRepository attendanceRepo,
        IContractRepository contractRepo,
        IClinicRepository clinicRepo,
        IUserRepository userRepo,
        ITenantService tenant)
    {
        _shiftRepo = shiftRepo;
        _attendanceRepo = attendanceRepo;
        _contractRepo = contractRepo;
        _clinicRepo = clinicRepo;
        _userRepo = userRepo;
        _tenant = tenant;
    }

    public async Task<BillingReportResponse> GetReportAsync(int year, int month)
    {
        if (year < 2000 || year > 3000)
            throw new BadRequestException("Ano inválido.");
        if (month < 1 || month > 12)
            throw new BadRequestException("Mês inválido (1-12).");

        var fromUtc = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var toUtc = fromUtc.AddMonths(1);

        // ── Escopo por tenant ────────────────────────────────────────────────
        var isAdminGlobal = _tenant.IsAdminGlobal();
        HashSet<Guid>? authorizedClinicIds = null;
        if (!isAdminGlobal)
        {
            authorizedClinicIds = _tenant.GetAuthorizedClinicIds().ToHashSet();
            if (authorizedClinicIds.Count == 0)
                return EmptyReport(year, month);
        }

        // ── Carrega clínicas, contratos, shifts, users em paralelo ─────────
        var allClinics = (await _clinicRepo.GetAllAsync()).ToList();
        var allContracts = (await _contractRepo.GetAllAsync()).ToList();
        var allUsers = (await _userRepo.GetAllAsync()).ToList();
        var allShifts = (await _shiftRepo.GetAllAsync()).ToList();

        // Escopa por clinicIds
        var scopedClinics = allClinics
            .Where(c => authorizedClinicIds is null || authorizedClinicIds.Contains(c.Id))
            .ToList();
        var scopedClinicIds = scopedClinics.Select(c => c.Id).ToHashSet();

        // Shifts do mês, dentro do escopo
        var shiftsInMonth = allShifts
            .Where(s => scopedClinicIds.Contains(s.ClinicId))
            .Where(s => s.Date >= fromUtc && s.Date < toUtc)
            .ToList();

        // Attendances do mês, por clínica autorizada
        var attendancesInMonth = new List<Attendance>();
        foreach (var clinicId in scopedClinicIds)
        {
            var att = await _attendanceRepo.GetByClinicAndDateRangeAsync(clinicId, fromUtc, toUtc);
            attendancesInMonth.AddRange(att);
        }

        // Contratos relevantes: os que cobrem clínicas escopadas
        var relevantContracts = allContracts
            .Where(c => c.Clinics.Any(cl => scopedClinicIds.Contains(cl.Id)))
            .ToList();

        // Mapa clinicId → contractId (para lookup rápido)
        var clinicToContract = scopedClinics
            .Where(c => c.ContractId.HasValue)
            .ToDictionary(c => c.Id, c => c.ContractId!.Value);

        // ── Assignments (previstos) por contrato/clínica/(user, clínica) ────
        // Estrutura: chave = (userId, clinicId), valor = qtde de assignments
        var assignmentsByDoctorClinic = new Dictionary<(Guid userId, Guid clinicId), int>();
        var assignmentsByContract = new Dictionary<Guid, int>();
        var assignmentsByClinic = new Dictionary<Guid, int>();

        foreach (var shift in shiftsInMonth)
        {
            foreach (var assignment in shift.ShiftAssignments ?? Enumerable.Empty<ShiftAssignment>())
            {
                var key = (assignment.UserId, shift.ClinicId);
                assignmentsByDoctorClinic[key] = assignmentsByDoctorClinic.GetValueOrDefault(key) + 1;
                assignmentsByClinic[shift.ClinicId] = assignmentsByClinic.GetValueOrDefault(shift.ClinicId) + 1;

                if (clinicToContract.TryGetValue(shift.ClinicId, out var contractId))
                    assignmentsByContract[contractId] = assignmentsByContract.GetValueOrDefault(contractId) + 1;
            }
        }

        // ── Attendances (cumpridos) por (userId, clinicId) e horas ─────────
        var fulfilledByDoctorClinic = new Dictionary<(Guid userId, Guid clinicId), int>();
        var hoursByDoctorClinic = new Dictionary<(Guid userId, Guid clinicId), decimal>();
        var hoursByClinic = new Dictionary<Guid, decimal>();

        foreach (var att in attendancesInMonth)
        {
            var key = (att.UserId, att.ClinicId);
            fulfilledByDoctorClinic[key] = fulfilledByDoctorClinic.GetValueOrDefault(key) + 1;

            decimal hours = 0m;
            if (att.CheckOutTime.HasValue)
            {
                hours = (decimal)(att.CheckOutTime.Value - att.CheckInTime).TotalHours;
                if (hours < 0) hours = 0;
            }
            hoursByDoctorClinic[key] = hoursByDoctorClinic.GetValueOrDefault(key) + hours;
            hoursByClinic[att.ClinicId] = hoursByClinic.GetValueOrDefault(att.ClinicId) + hours;
        }

        // ── pricePerShift por contrato = MonthlyValue / totalPlanned ───────
        var pricePerShiftByContract = new Dictionary<Guid, decimal>();
        foreach (var contract in relevantContracts)
        {
            var planned = assignmentsByContract.GetValueOrDefault(contract.Id);
            var monthly = contract.MonthlyValue ?? 0m;
            pricePerShiftByContract[contract.Id] = planned > 0 && monthly > 0
                ? Math.Round(monthly / planned, 2, MidpointRounding.AwayFromZero)
                : 0m;
        }

        // ── Contratos: sumarização ─────────────────────────────────────────
        var contractSummaries = new List<ContractBillingSummary>();
        foreach (var contract in relevantContracts)
        {
            var planned = assignmentsByContract.GetValueOrDefault(contract.Id);
            var pricePerShift = pricePerShiftByContract[contract.Id];

            // Cumpridos do contrato = soma dos fulfilled cujas clinics são deste contrato
            var contractClinicIds = contract.Clinics
                .Where(c => scopedClinicIds.Contains(c.Id))
                .Select(c => c.Id)
                .ToHashSet();
            var fulfilled = fulfilledByDoctorClinic
                .Where(kv => contractClinicIds.Contains(kv.Key.clinicId))
                .Sum(kv => kv.Value);

            var monthly = contract.MonthlyValue ?? 0m;
            var missed = Math.Max(0, planned - fulfilled);
            var discount = missed * pricePerShift;
            var netPayable = Math.Max(0m, monthly - discount);

            contractSummaries.Add(new ContractBillingSummary
            {
                ContractId = contract.Id,
                ContractNumber = contract.ContractNumber,
                PublicOrganId = contract.PublicOrganId,
                PublicOrganName = contract.PublicOrgan?.Name ?? "—",
                MonthlyValue = monthly,
                ClinicCount = contractClinicIds.Count,
                ShiftsPlanned = planned,
                ShiftsFulfilled = fulfilled,
                FulfillmentPercent = planned > 0
                    ? Math.Round((decimal)fulfilled / planned * 100m, 1, MidpointRounding.AwayFromZero)
                    : 0m,
                Discount = discount,
                NetPayable = netPayable,
            });
        }

        // ── Horas por UPA ──────────────────────────────────────────────────
        var clinicHours = scopedClinics
            .Select(c => new ClinicHoursSummary
            {
                ClinicId = c.Id,
                ClinicName = c.Name,
                Hours = Math.Round(hoursByClinic.GetValueOrDefault(c.Id), 1),
            })
            .Where(x => x.Hours > 0 || assignmentsByClinic.ContainsKey(x.ClinicId))
            .OrderByDescending(x => x.Hours)
            .ToList();

        // ── Linhas por médico × UPA ────────────────────────────────────────
        var usersById = allUsers.ToDictionary(u => u.Id);
        var clinicsById = scopedClinics.ToDictionary(c => c.Id);

        var doctorRows = new List<DoctorBillingRow>();
        foreach (var kv in assignmentsByDoctorClinic)
        {
            var (userId, clinicId) = kv.Key;
            var planned = kv.Value;
            if (!usersById.TryGetValue(userId, out var user)) continue;
            if (!clinicsById.TryGetValue(clinicId, out var clinic)) continue;

            var fulfilled = fulfilledByDoctorClinic.GetValueOrDefault(kv.Key);
            var hours = hoursByDoctorClinic.GetValueOrDefault(kv.Key);

            // Preço deste médico depende do contrato da clínica
            var pricePerShift = 0m;
            if (clinicToContract.TryGetValue(clinicId, out var contractId))
                pricePerShift = pricePerShiftByContract.GetValueOrDefault(contractId);

            var gross = planned * pricePerShift;
            var missed = Math.Max(0, planned - fulfilled);
            var discount = missed * pricePerShift;
            var net = Math.Max(0m, gross - discount);

            doctorRows.Add(new DoctorBillingRow
            {
                UserId = userId,
                UserName = user.Name,
                RegistrationNumber = user.RegistrationNumber,
                ClinicId = clinicId,
                ClinicName = clinic.Name,
                ShiftsPlanned = planned,
                ShiftsFulfilled = fulfilled,
                HoursWorked = Math.Round(hours, 1),
                FulfillmentPercent = planned > 0
                    ? Math.Round((decimal)fulfilled / planned * 100m, 1, MidpointRounding.AwayFromZero)
                    : 0m,
                GrossAmount = gross,
                Discount = discount,
                NetAmount = net,
            });
        }

        doctorRows = doctorRows
            .OrderBy(r => r.ClinicName)
            .ThenBy(r => r.UserName)
            .ToList();

        // ── KPIs agregados ─────────────────────────────────────────────────
        var totalPlanned = assignmentsByDoctorClinic.Values.Sum();
        var totalFulfilled = fulfilledByDoctorClinic.Values.Sum();
        var totalHours = doctorRows.Sum(r => r.HoursWorked);
        var totalRevenue = contractSummaries.Sum(c => c.MonthlyValue);
        var totalDiscount = contractSummaries.Sum(c => c.Discount);
        var totalNet = Math.Max(0m, totalRevenue - totalDiscount);
        var fulfillment = totalPlanned > 0
            ? Math.Round((decimal)totalFulfilled / totalPlanned * 100m, 1, MidpointRounding.AwayFromZero)
            : 0m;

        return new BillingReportResponse
        {
            Year = year,
            Month = month,
            TotalRevenue = totalRevenue,
            TotalHours = totalHours,
            TotalShiftsPlanned = totalPlanned,
            TotalShiftsFulfilled = totalFulfilled,
            TotalDiscount = totalDiscount,
            NetPayable = totalNet,
            FulfillmentPercent = fulfillment,
            Contracts = contractSummaries.OrderByDescending(c => c.MonthlyValue).ToList(),
            ClinicHours = clinicHours,
            Doctors = doctorRows,
        };
    }

    private static BillingReportResponse EmptyReport(int year, int month) => new()
    {
        Year = year,
        Month = month,
    };
}
