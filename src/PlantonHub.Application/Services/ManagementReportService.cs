using PlantonHub.Application.DTOs.ManagementReport;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

/// <summary>
/// Agrega dados operacionais em uma visão executiva mensal (Admin OS → Gerencial).
/// Apenas AdminGlobal tem acesso — o AdminClinica não vê o quadro completo da OS.
///
/// Regras principais:
///  • SLA de um shift = (assignments com attendance) / (assignments totais).
///  • Ausência = assignment sem attendance quando o shift já começou.
///  • Atraso = attendance com CheckInTime > (Shift.Date + Shift.StartTime + tolerância).
///  • Contrato "no SLA" = SlaPercent >= MinSlaPercent (default 90 quando não configurado).
///  • Ranking UPAs: SLA por clínica, ordem decrescente.
///  • Evolução: últimos 5 meses (inclui o mês corrente).
/// </summary>
public class ManagementReportService : IManagementReportService
{
    private readonly IShiftRepository _shiftRepo;
    private readonly IContractRepository _contractRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IUserRepository _userRepo;
    private readonly ISettingsRepository _settingsRepo;
    private readonly ITenantService _tenantService;

    private static readonly string[] MonthsPtShort =
        { "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez" };
    private static readonly string[] MonthsPtLong =
    {
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    };

    public ManagementReportService(
        IShiftRepository shiftRepo,
        IContractRepository contractRepo,
        IClinicRepository clinicRepo,
        IUserRepository userRepo,
        ISettingsRepository settingsRepo,
        ITenantService tenantService)
    {
        _shiftRepo = shiftRepo;
        _contractRepo = contractRepo;
        _clinicRepo = clinicRepo;
        _userRepo = userRepo;
        _settingsRepo = settingsRepo;
        _tenantService = tenantService;
    }

    public async Task<ManagementReportResponse> GetReportAsync(int? year = null, int? month = null)
    {
        EnsureAdminGlobal();

        var now = DateTime.UtcNow;
        var y = year ?? now.Year;
        var m = month ?? now.Month;
        if (m < 1 || m > 12) throw new BadRequestException("Mês inválido — precisa estar entre 1 e 12.");

        var (from, to) = MonthRange(y, m);
        var (prevFrom, prevTo) = MonthRange(from.AddMonths(-1).Year, from.AddMonths(-1).Month);

        var settings = await _settingsRepo.GetAsync();
        var tolerance = TimeSpan.FromMinutes(settings.CheckInToleranceMinutes);

        var allShifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(from, to)).ToList();
        var prevShifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(prevFrom, prevTo)).ToList();

        var current = ComputeAggregations(allShifts, tolerance);
        var previous = ComputeAggregations(prevShifts, tolerance);

        var allContracts = (await _contractRepo.GetAllAsync()).ToList();
        var contractsSummary = BuildContractSummaries(current, previous, allContracts);
        var clinicRanking = BuildClinicRanking(current, allShifts);
        var problemDoctors = BuildProblemDoctors(current);

        // Evolução — últimos 5 meses incluindo o mês corrente
        var evolution = await BuildEvolutionAsync(y, m, tolerance, allContracts);

        // Contratos no SLA
        var contractsInSla = new ContractsInSlaKpi
        {
            InSla = contractsSummary.Count(c => c.SlaPercent >= c.TargetPercent),
            Total = contractsSummary.Count,
            Direction = "flat",
            Label = "→ Igual ao mês anterior",
        };
        var prevInSla = BuildContractSummaries(previous, previous, allContracts)
            .Count(c => c.SlaPercent >= c.TargetPercent);
        if (contractsInSla.InSla > prevInSla) { contractsInSla.Direction = "up"; contractsInSla.Label = "↑ +" + (contractsInSla.InSla - prevInSla) + " vs mês anterior"; }
        else if (contractsInSla.InSla < prevInSla) { contractsInSla.Direction = "down"; contractsInSla.Label = "↓ " + (prevInSla - contractsInSla.InSla) + " vs mês anterior"; }

        // KPIs de topo
        var slaKpi = BuildTrend(current.SlaPercent, previous.SlaPercent, isPercent: true, invertColor: false);
        var absKpi = BuildTrend(current.AbsenceCount, previous.AbsenceCount, isPercent: false, invertColor: true);
        var lateKpi = BuildTrend(current.LateCount, previous.LateCount, isPercent: false, invertColor: true);

        return new ManagementReportResponse
        {
            Year = y,
            Month = m,
            PeriodLabel = char.ToUpperInvariant(MonthsPtLong[m - 1][0]) + MonthsPtLong[m - 1][1..] + " " + y,
            SlaGlobal = new KpiWithTrend<double> { Value = Math.Round(current.SlaPercent, 1), Delta = slaKpi.Delta, Direction = slaKpi.Direction, Label = slaKpi.Label },
            TotalAbsences = new KpiWithTrend<int> { Value = current.AbsenceCount, Delta = absKpi.Delta, Direction = absKpi.Direction, Label = absKpi.Label },
            TotalLateEvents = new KpiWithTrend<int> { Value = current.LateCount, Delta = lateKpi.Delta, Direction = lateKpi.Direction, Label = lateKpi.Label },
            ContractsInSla = contractsInSla,
            Contracts = contractsSummary,
            ClinicRanking = clinicRanking,
            ProblemDoctors = problemDoctors,
            Trends = BuildTrendCards(current, previous, clinicRanking, contractsSummary),
            Evolution = evolution,
            Highlights = BuildHighlights(current, contractsSummary, clinicRanking, problemDoctors),
        };
    }

    // ── Autorização ─────────────────────────────────────────────────────────

    private void EnsureAdminGlobal()
    {
        if (!_tenantService.IsAdminGlobal())
            throw new ForbiddenException("Only AdminGlobal can view the management report.");
    }

    // ── Agregações base ─────────────────────────────────────────────────────

    private record ClinicAgg(Guid ClinicId, string ClinicName, Guid? ContractId, int Scheduled, int Fulfilled, int Absences, int Late);
    private record DoctorAgg(Guid UserId, string UserName, string? ClinicName, int Absences, int Late);
    private record Aggregations(
        double SlaPercent,
        int AbsenceCount,
        int LateCount,
        int ScheduledCount,
        int FulfilledCount,
        Dictionary<Guid, ClinicAgg> ByClinic,
        Dictionary<Guid, DoctorAgg> ByDoctor);

    private static Aggregations ComputeAggregations(List<Shift> shifts, TimeSpan tolerance)
    {
        int scheduled = 0, fulfilled = 0, absences = 0, late = 0;
        var byClinic = new Dictionary<Guid, ClinicAgg>();
        var byDoctor = new Dictionary<Guid, DoctorAgg>();

        foreach (var s in shifts)
        {
            var assignments = s.ShiftAssignments?.ToList() ?? new List<ShiftAssignment>();
            var attendances = s.Attendances?.ToList() ?? new List<Attendance>();
            var shiftStart = s.Date.Date.Add(s.StartTime);
            var lateThreshold = shiftStart.Add(tolerance);

            foreach (var a in assignments)
            {
                scheduled++;
                var att = attendances.FirstOrDefault(x => x.UserId == a.UserId);
                if (att != null)
                {
                    fulfilled++;
                    if (att.CheckInTime > lateThreshold) late++;
                }
                else
                {
                    absences++;
                }

                var clinicId = s.ClinicId;
                var clinicName = s.Clinic?.Name ?? "—";
                if (!byClinic.TryGetValue(clinicId, out var ca))
                    ca = new ClinicAgg(clinicId, clinicName, s.Clinic?.ContractId, 0, 0, 0, 0);
                byClinic[clinicId] = ca with
                {
                    Scheduled = ca.Scheduled + 1,
                    Fulfilled = ca.Fulfilled + (att != null ? 1 : 0),
                    Absences = ca.Absences + (att is null ? 1 : 0),
                    Late = ca.Late + (att != null && att.CheckInTime > lateThreshold ? 1 : 0),
                };

                if (!byDoctor.TryGetValue(a.UserId, out var da))
                    da = new DoctorAgg(a.UserId, a.User?.Name ?? "—", s.Clinic?.Name, 0, 0);
                byDoctor[a.UserId] = da with
                {
                    Absences = da.Absences + (att is null ? 1 : 0),
                    Late = da.Late + (att != null && att.CheckInTime > lateThreshold ? 1 : 0),
                };
            }
        }

        double sla = scheduled == 0 ? 0 : (fulfilled / (double)scheduled) * 100.0;
        return new Aggregations(sla, absences, late, scheduled, fulfilled, byClinic, byDoctor);
    }

    // ── Blocos do relatório ─────────────────────────────────────────────────

    private List<ContractSlaSummary> BuildContractSummaries(Aggregations agg, Aggregations _, List<Contract> allContracts)
    {
        // Agrupa clínicas pelo ContractId; contratos sem clínicas ativas ficam de fora.
        var groups = agg.ByClinic.Values
            .Where(c => c.ContractId.HasValue)
            .GroupBy(c => c.ContractId!.Value)
            .ToList();

        var summaries = new List<ContractSlaSummary>();
        foreach (var g in groups)
        {
            var scheduled = g.Sum(c => c.Scheduled);
            var fulfilled = g.Sum(c => c.Fulfilled);
            var slaPct = scheduled == 0 ? 0 : (fulfilled / (double)scheduled) * 100.0;

            var contract = allContracts.FirstOrDefault(c => c.Id == g.Key);
            var target = (double)(contract?.MinSlaPercent ?? 90);

            summaries.Add(new ContractSlaSummary
            {
                ContractId = g.Key,
                ContractNumber = contract?.ContractNumber ?? "—",
                PublicOrganName = contract?.PublicOrgan?.Name ?? "—",
                StartDate = contract?.StartDate,
                EndDate = contract?.EndDate,
                SlaPercent = Math.Round(slaPct, 1),
                TargetPercent = target,
                ClinicCount = g.Count(),
                AbsenceCount = g.Sum(c => c.Absences),
                MonthlyValue = contract?.MonthlyValue,
                Status = slaPct >= target ? "ok" : slaPct >= target - 5 ? "warn" : "crit",
            });
        }

        // Inclui contratos ativos que não tiveram shifts no mês (SLA = 0)
        foreach (var c in allContracts.Where(c => c.Status == ContractStatus.Active))
        {
            if (summaries.Any(s => s.ContractId == c.Id)) continue;
            summaries.Add(new ContractSlaSummary
            {
                ContractId = c.Id,
                ContractNumber = c.ContractNumber,
                PublicOrganName = c.PublicOrgan?.Name ?? "—",
                StartDate = c.StartDate,
                EndDate = c.EndDate,
                SlaPercent = 0,
                TargetPercent = c.MinSlaPercent ?? 90,
                ClinicCount = c.Clinics?.Count ?? 0,
                AbsenceCount = 0,
                MonthlyValue = c.MonthlyValue,
                Status = "warn",
            });
        }

        return summaries.OrderByDescending(s => s.SlaPercent).ToList();
    }

    private static List<ClinicRankItem> BuildClinicRanking(Aggregations agg, List<Shift> shifts)
    {
        var items = agg.ByClinic.Values
            .Select(c => new ClinicRankItem
            {
                ClinicId = c.ClinicId,
                ClinicName = c.ClinicName,
                SlaPercent = c.Scheduled == 0 ? 0 : Math.Round((c.Fulfilled / (double)c.Scheduled) * 100.0, 1),
            })
            .OrderByDescending(c => c.SlaPercent)
            .ToList();
        for (int i = 0; i < items.Count; i++) items[i].Position = i + 1;
        return items;
    }

    private static List<ProblemDoctor> BuildProblemDoctors(Aggregations agg)
    {
        return agg.ByDoctor.Values
            .Where(d => (d.Absences + d.Late) > 0)
            .OrderByDescending(d => d.Absences + d.Late)
            .Take(5)
            .Select(d => new ProblemDoctor
            {
                UserId = d.UserId,
                UserName = d.UserName,
                Initials = Initials(d.UserName),
                ClinicName = d.ClinicName,
                OccurrenceCount = d.Absences + d.Late,
                AbsenceCount = d.Absences,
                LateCount = d.Late,
            })
            .ToList();
    }

    private async Task<SlaEvolution> BuildEvolutionAsync(int year, int month, TimeSpan tolerance, List<Contract> contracts)
    {
        var evo = new SlaEvolution();

        // Últimos 5 meses (inclui o mês atual)
        var months = new List<(int Y, int M)>();
        for (int i = 4; i >= 0; i--)
        {
            var d = new DateTime(year, month, 1).AddMonths(-i);
            months.Add((d.Year, d.Month));
        }
        evo.Months = months.Select(t => MonthsPtShort[t.M - 1]).ToList();

        // Escolhe até 2 contratos mais antigos ativos pra plotar
        var activeContracts = contracts
            .Where(c => c.Status == ContractStatus.Active)
            .OrderBy(c => c.StartDate)
            .Take(2)
            .ToList();

        var colors = new[] { "#6366f1", "#f97316" };
        for (int i = 0; i < activeContracts.Count; i++)
        {
            evo.ContractSeries.Add(new EvolutionSeries
            {
                ContractId = activeContracts[i].Id,
                Label = activeContracts[i].PublicOrgan?.Name ?? activeContracts[i].ContractNumber,
                Color = colors[i % colors.Length],
                Values = new List<double>(),
            });
        }

        foreach (var (y, m) in months)
        {
            var (from, to) = MonthRange(y, m);
            var shifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(from, to)).ToList();
            var agg = ComputeAggregations(shifts, tolerance);
            evo.AbsencesByMonth.Add(agg.AbsenceCount);

            foreach (var s in evo.ContractSeries)
            {
                var byClinic = agg.ByClinic.Values.Where(c => c.ContractId == s.ContractId).ToList();
                var sched = byClinic.Sum(c => c.Scheduled);
                var fulfilled = byClinic.Sum(c => c.Fulfilled);
                s.Values.Add(sched == 0 ? 0 : Math.Round((fulfilled / (double)sched) * 100.0, 1));
            }
        }

        return evo;
    }

    private static List<TrendCard> BuildTrendCards(
        Aggregations current, Aggregations previous,
        List<ClinicRankItem> ranking, List<ContractSlaSummary> contracts)
    {
        var trends = new List<TrendCard>();

        // Tendência SLA
        var dir = current.SlaPercent > previous.SlaPercent ? "up"
                : current.SlaPercent < previous.SlaPercent ? "down" : "flat";
        trends.Add(new TrendCard
        {
            Key = "sla-trend",
            Label = "Tendência SLA",
            Value = dir == "up" ? "Melhora" : dir == "down" ? "Queda" : "Estável",
            SubLabel = "vs mês anterior",
            Direction = dir,
        });

        // Médicos críticos (≥ 5 ocorrências)
        var criticos = current.ByDoctor.Values.Count(d => (d.Absences + d.Late) >= 5);
        trends.Add(new TrendCard
        {
            Key = "critical-doctors",
            Label = "Médicos críticos",
            Value = criticos == 1 ? "1 profissional" : criticos + " profissionais",
            SubLabel = "com 5+ ocorrências",
            Direction = "flat",
        });

        // UPA em destaque (top do ranking)
        var top = ranking.FirstOrDefault();
        if (top != null)
        {
            trends.Add(new TrendCard
            {
                Key = "top-clinic",
                Label = "UPA em destaque",
                Value = top.ClinicName,
                SubLabel = top.SlaPercent.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture).Replace('.', ',') + "% de cumprimento",
                Direction = "up",
            });
        }

        // UPA com alerta (última do ranking)
        var last = ranking.LastOrDefault();
        if (last != null && ranking.Count > 1)
        {
            trends.Add(new TrendCard
            {
                Key = "alert-clinic",
                Label = "UPA com alerta",
                Value = last.ClinicName,
                SubLabel = last.SlaPercent.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture).Replace('.', ',') + "% — abaixo da meta",
                Direction = "down",
            });
        }

        // Placeholders (para exibir sempre 6 cards)
        trends.Add(new TrendCard
        {
            Key = "substitutions",
            Label = "Substituições",
            Value = current.AbsenceCount + " no mês",
            SubLabel = "cobertas total ou parcialmente",
            Direction = "flat",
        });
        trends.Add(new TrendCard
        {
            Key = "justifications",
            Label = "Justificativas",
            Value = "—",
            SubLabel = "aguarde módulo",
            Direction = "flat",
        });

        return trends;
    }

    private static List<MeetingHighlight> BuildHighlights(
        Aggregations agg, List<ContractSlaSummary> contracts,
        List<ClinicRankItem> ranking, List<ProblemDoctor> doctors)
    {
        var list = new List<MeetingHighlight>();

        var top = ranking.FirstOrDefault();
        if (top != null)
            list.Add(new MeetingHighlight
            {
                Kind = "pos",
                Text = $"UPA {top.ClinicName} com melhor desempenho: {FormatPct(top.SlaPercent)} de cumprimento de escala.",
            });

        var worstDoctor = doctors.FirstOrDefault();
        if (worstDoctor != null && worstDoctor.AbsenceCount > 0)
            list.Add(new MeetingHighlight
            {
                Kind = "neg",
                Text = $"{worstDoctor.UserName} com {worstDoctor.AbsenceCount} ausências no período. Acionamento formal pendente.",
            });

        var underTarget = contracts.FirstOrDefault(c => c.SlaPercent < c.TargetPercent);
        if (underTarget != null)
            list.Add(new MeetingHighlight
            {
                Kind = "neg",
                Text = $"SLA global {FormatPct(agg.SlaPercent)} — abaixo da meta de {FormatPct(underTarget.TargetPercent)}. Plano de ação necessário.",
            });

        // Contrato próximo do vencimento (< 60 dias)
        var expiring = contracts
            .Where(c => c.EndDate.HasValue)
            .Select(c => new { c, Days = (int)(c.EndDate!.Value - DateTime.UtcNow.Date).TotalDays })
            .Where(x => x.Days is >= 0 and <= 60)
            .OrderBy(x => x.Days)
            .FirstOrDefault();
        if (expiring != null)
            list.Add(new MeetingHighlight
            {
                Kind = "neu",
                Text = $"Contrato {expiring.c.PublicOrganName} vence em {expiring.Days} dias. Iniciar tratativas de renovação.",
            });

        if (list.Count == 0)
            list.Add(new MeetingHighlight { Kind = "neu", Text = "Sem destaques relevantes no período." });

        return list;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static (DateTime from, DateTime to) MonthRange(int year, int month)
    {
        var from = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var to = from.AddMonths(1);
        return (from, to);
    }

    private static (double? Delta, string Direction, string Label) BuildTrend(
        double current, double previous, bool isPercent, bool invertColor)
    {
        var delta = current - previous;
        string direction;
        if (Math.Abs(delta) < 0.05) direction = "flat";
        else if (delta > 0) direction = invertColor ? "down" : "up";
        else direction = invertColor ? "up" : "down";

        var arrow = delta > 0 ? "↑ +" : delta < 0 ? "↓ " : "→ ";
        var val = Math.Abs(delta).ToString(isPercent ? "0.#" : "0",
            System.Globalization.CultureInfo.InvariantCulture).Replace('.', ',');
        var suffix = isPercent ? "%" : "";
        var label = direction == "flat"
            ? "→ Igual ao mês anterior"
            : $"{arrow}{val}{suffix} vs mês anterior";
        return (delta, direction, label);
    }

    private static string FormatPct(double v) =>
        v.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture).Replace('.', ',') + "%";

    private static string Initials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "—";
        if (parts.Length == 1) return parts[0][..Math.Min(2, parts[0].Length)].ToUpperInvariant();
        return (parts[0][0].ToString() + parts[^1][0].ToString()).ToUpperInvariant();
    }
}
