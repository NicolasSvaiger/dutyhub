using PlantonHub.Application.Constants;
using PlantonHub.Application.DTOs.Alerts;
using PlantonHub.Application.DTOs.Prefeitura;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.Application.Services;

/// <summary>
/// Portal Prefeitura — leituras agregadas dentro do escopo do gestor.
/// Todo método resolve o escopo (organ + descendentes → clinicIds via
/// contratos ativos) e cacheia por TTL curto (15-60s). Sem invalidação
/// cirúrgica: aceita-se staleness de até 1 min pra reduzir carga no DB.
/// Ver design.md § "Endpoints" e "Cache strategy".
/// </summary>
public class PrefeituraService : IPrefeituraService
{
    private readonly ITenantService _tenantService;
    private readonly ICacheService _cache;
    private readonly IPublicOrganRepository _organRepo;
    private readonly IContractRepository _contractRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IShiftRepository _shiftRepo;
    private readonly IAttendanceRepository _attendanceRepo;
    private readonly ISubstitutionRepository _substitutionRepo;
    private readonly IJustificationRepository _justificationRepo;
    private readonly IAlertRepository _alertRepo;
    private readonly ISettingsRepository _settingsRepo;
    private readonly IAlertService _alertService;

    public PrefeituraService(
        ITenantService tenantService,
        ICacheService cache,
        IPublicOrganRepository organRepo,
        IContractRepository contractRepo,
        IClinicRepository clinicRepo,
        IShiftRepository shiftRepo,
        IAttendanceRepository attendanceRepo,
        ISubstitutionRepository substitutionRepo,
        IJustificationRepository justificationRepo,
        IAlertRepository alertRepo,
        ISettingsRepository settingsRepo,
        IAlertService alertService)
    {
        _tenantService = tenantService;
        _cache = cache;
        _organRepo = organRepo;
        _contractRepo = contractRepo;
        _clinicRepo = clinicRepo;
        _shiftRepo = shiftRepo;
        _attendanceRepo = attendanceRepo;
        _substitutionRepo = substitutionRepo;
        _justificationRepo = justificationRepo;
        _alertRepo = alertRepo;
        _settingsRepo = settingsRepo;
        _alertService = alertService;
    }

    // ─────────────────────────────────────────────────────────────
    // Escopo — resolvido uma vez por request. Todo endpoint chama isso.
    // ─────────────────────────────────────────────────────────────

    private sealed record PrefeituraScope(
        Guid OrganId,
        IReadOnlyCollection<Guid> OrganIds,
        IReadOnlyCollection<Guid> ClinicIds);

    /// <summary>
    /// Resolve o escopo do gestor logado:
    ///   1. Descendentes hierárquicos do organ (cache 5min via <c>PrefeituraOrganScope</c>).
    ///   2. Clínicas cobertas por contratos ativos naqueles organs.
    /// Falha 403 quando o gestor não tem organ resolvido — cenário
    /// documentado em design.md § "Error Handling" (NO_ORGAN_CONTEXT).
    /// </summary>
    private async Task<PrefeituraScope> ResolveScopeAsync(CancellationToken ct)
    {
        var organId = _tenantService.GetCurrentPublicOrganId()
            ?? throw new ForbiddenException("NO_ORGAN_CONTEXT");

        var organIds = await _cache.GetOrSetAsync(
            CacheKeys.PrefeituraOrganScope(organId),
            async () => (await _organRepo.GetDescendantIdsAsync(organId, ct)).ToList(),
            TimeSpan.FromMinutes(5),
            ct);

        // Cache retorna null? guarda defensiva (fail-open com só o organ raiz).
        var organIdsList = organIds ?? new List<Guid> { organId };

        var clinicIds = (await _contractRepo.GetActiveClinicIdsByOrganIdsAsync(organIdsList, ct)).ToList();
        return new PrefeituraScope(organId, organIdsList, clinicIds);
    }

    // ─────────────────────────────────────────────────────────────
    // Dashboard — Início do portal. TTL 30s.
    // ─────────────────────────────────────────────────────────────

    public async Task<PrefeituraDashboardResponse> GetDashboardAsync(CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);

        var cached = await _cache.GetOrSetAsync(
            CacheKeys.PrefeituraDashboard(scope.OrganId),
            () => BuildDashboardAsync(scope, ct),
            TimeSpan.FromSeconds(30),
            ct);

        return cached ?? await BuildDashboardAsync(scope, ct);
    }

    private async Task<PrefeituraDashboardResponse> BuildDashboardAsync(PrefeituraScope scope, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var startOfDay = DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);
        var endOfDay = startOfDay.AddDays(1);
        var settings = await _settingsRepo.GetAsync();

        // Shifts do dia com assignments + attendances (uma query só).
        var shifts = scope.ClinicIds.Count == 0
            ? Enumerable.Empty<Shift>()
            : (await _shiftRepo.GetInPeriodWithDetailsAsync(startOfDay, endOfDay))
                .Where(s => scope.ClinicIds.Contains(s.ClinicId));

        int expected = 0, covered = 0, absences = 0, lateEvents = 0;
        foreach (var s in shifts)
        {
            foreach (var assignment in s.ShiftAssignments)
            {
                expected++;
                var attendance = s.Attendances.FirstOrDefault(a => a.UserId == assignment.UserId);
                if (attendance is null)
                {
                    if (ShiftAlreadyPastAbsenceThreshold(s, now, settings)) absences++;
                }
                else
                {
                    covered++;
                    if (IsLate(attendance, s, settings)) lateEvents++;
                }
            }
        }

        var complianceRate = expected == 0 ? 0.0 : Math.Round(100.0 * covered / expected, 1);

        var alerts = (await _alertRepo.GetByClinicIdsAsync(scope.ClinicIds, includeGlobal: false))
            .Where(a => !a.IsResolved)
            .OrderByDescending(a => a.CreatedAt)
            .Take(5)
            .Select(a => new PrefeituraDashboardAlert
            {
                Id = a.Id,
                Code = a.Code,
                Level = a.Level.ToString().ToLowerInvariant(),
                Title = a.Title,
                ClinicName = a.Clinic?.Name,
                CreatedAt = a.CreatedAt,
            })
            .ToList();

        return new PrefeituraDashboardResponse
        {
            AsOf = now,
            PeriodLabel = $"Hoje, {startOfDay:dd/MM}",
            TodayComplianceRate = complianceRate,
            TodayExpectedShifts = expected,
            TodayCoveredShifts = covered,
            TodayOpenAbsences = absences,
            TodayLateEvents = lateEvents,
            ClinicCount = scope.ClinicIds.Count,
            RecentAlerts = alerts,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Regras compartilhadas de atraso / ausência
    // ─────────────────────────────────────────────────────────────

    private static DateTime ShiftStartUtc(Shift s) =>
        DateTime.SpecifyKind(s.Date.Date.Add(s.StartTime), DateTimeKind.Utc);

    private static bool IsLate(Attendance a, Shift s, SystemSettings settings, int? forceToleranceMinutes = null)
    {
        var toleranceMinutes = forceToleranceMinutes ?? s.Clinic?.CheckInToleranceMinutes ?? settings.CheckInToleranceMinutes;
        return a.CheckInTime > ShiftStartUtc(s).AddMinutes(toleranceMinutes);
    }

    private static int LateMinutes(Attendance a, Shift s, SystemSettings settings, int? forceToleranceMinutes = null)
    {
        var toleranceMinutes = forceToleranceMinutes ?? s.Clinic?.CheckInToleranceMinutes ?? settings.CheckInToleranceMinutes;
        var threshold = ShiftStartUtc(s).AddMinutes(toleranceMinutes);
        var diff = (a.CheckInTime - threshold).TotalMinutes;
        return diff <= 0 ? 0 : (int)Math.Round(diff);
    }

    /// <summary>Serializa <c>User.ProfessionalType</c> pro frontend — "Medico" |
    /// "Enfermeiro" | null (cadastros sem o campo preenchido, ex.: gestores).</summary>
    private static string? ProfessionalTypeLabel(ProfessionalType? type) => type?.ToString();

    private static bool ShiftAlreadyPastAbsenceThreshold(Shift s, DateTime now, SystemSettings settings) =>
        now >= ShiftStartUtc(s).AddMinutes(settings.AbsenceThresholdMinutes);

    // ─────────────────────────────────────────────────────────────
    // KPIs — tela KPIs. TTL 60s.
    // ─────────────────────────────────────────────────────────────

    public async Task<PrefeituraKpisResponse> GetKpisAsync(DateTime from, DateTime to, CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);
        var (fromUtc, toUtc) = NormalizePeriod(from, to);

        var cached = await _cache.GetOrSetAsync(
            CacheKeys.PrefeituraKpis(scope.OrganId, fromUtc, toUtc),
            () => BuildKpisAsync(scope, fromUtc, toUtc),
            TimeSpan.FromSeconds(60),
            ct);

        return cached ?? await BuildKpisAsync(scope, fromUtc, toUtc);
    }

    private async Task<PrefeituraKpisResponse> BuildKpisAsync(PrefeituraScope scope, DateTime fromUtc, DateTime toUtc)
    {
        var settings = await _settingsRepo.GetAsync();

        var shifts = scope.ClinicIds.Count == 0
            ? new List<Shift>()
            : (await _shiftRepo.GetInPeriodWithDetailsAsync(fromUtc, toUtc))
                .Where(s => scope.ClinicIds.Contains(s.ClinicId))
                .ToList();

        // Substituições no período — pra taxa de substituição.
        var substitutions = scope.ClinicIds.Count == 0
            ? new List<Substitution>()
            : (await _substitutionRepo.GetByClinicIdsAsync(scope.ClinicIds))
                .Where(sub => sub.ShiftDate >= fromUtc.Date && sub.ShiftDate < toUtc.Date)
                .ToList();

        var byClinic = new Dictionary<Guid, PrefeituraKpiByClinic>();
        int totalExpected = 0, totalCovered = 0, totalAbsences = 0, totalLate = 0;
        long totalLateMinutes = 0;

        // Acumuladores por médico — base pros rankings "Maiores ausências" e
        // "Melhor frequência". ClinicCounts guarda em qual UPA o médico mais
        // atuou, usada só como UPA "âncora" de exibição (mesma heurística de
        // GetFrequencyByDoctorAsync).
        var byDoctor = new Dictionary<Guid, PrefeituraKpiDoctorItem>();
        var doctorClinicCounts = new Dictionary<Guid, Dictionary<Guid, int>>();

        foreach (var s in shifts)
        {
            var row = byClinic.TryGetValue(s.ClinicId, out var existing)
                ? existing
                : byClinic[s.ClinicId] = new PrefeituraKpiByClinic
                {
                    ClinicId = s.ClinicId,
                    ClinicName = s.Clinic?.Name ?? string.Empty,
                };

            foreach (var assignment in s.ShiftAssignments)
            {
                row.ExpectedShifts++;
                totalExpected++;

                var userId = assignment.UserId;
                if (!byDoctor.TryGetValue(userId, out var docRow))
                {
                    docRow = new PrefeituraKpiDoctorItem
                    {
                        UserId = userId,
                        UserName = assignment.User?.Name ?? string.Empty,
                        RegistrationNumber = assignment.User?.RegistrationNumber,
                        ProfessionalType = ProfessionalTypeLabel(assignment.User?.ProfessionalType),
                    };
                    byDoctor[userId] = docRow;
                    doctorClinicCounts[userId] = new Dictionary<Guid, int>();
                }
                doctorClinicCounts[userId][s.ClinicId] = doctorClinicCounts[userId].GetValueOrDefault(s.ClinicId) + 1;

                var attendance = s.Attendances.FirstOrDefault(a => a.UserId == userId);
                if (attendance is null)
                {
                    if (ShiftAlreadyPastAbsenceThreshold(s, DateTime.UtcNow, settings))
                    {
                        row.Absences++;
                        totalAbsences++;
                        docRow.Absences++;
                    }
                }
                else
                {
                    row.CoveredShifts++;
                    totalCovered++;
                    if (IsLate(attendance, s, settings))
                    {
                        row.LateEvents++;
                        totalLate++;
                        totalLateMinutes += LateMinutes(attendance, s, settings);
                    }
                }
            }
        }

        foreach (var row in byClinic.Values)
        {
            row.ComplianceRate = row.ExpectedShifts == 0
                ? 0.0
                : Math.Round(100.0 * row.CoveredShifts / row.ExpectedShifts, 1);
        }

        var kpiClinicNames = shifts
            .Select(s => (s.ClinicId, Name: s.Clinic?.Name ?? string.Empty))
            .Distinct()
            .ToDictionary(x => x.ClinicId, x => x.Name);

        // ComplianceRate por médico = coveredShifts / expectedShifts do
        // próprio médico (não temos essa contagem no docRow ainda — deriva
        // dos shifts onde ele foi assignado, contando via clinicCounts sum).
        foreach (var docRow in byDoctor.Values)
        {
            var expectedForDoctor = doctorClinicCounts[docRow.UserId].Values.Sum();
            docRow.ComplianceRate = expectedForDoctor == 0
                ? 0.0
                : Math.Round(100.0 * (expectedForDoctor - docRow.Absences) / expectedForDoctor, 1);

            var anchorClinicId = doctorClinicCounts[docRow.UserId]
                .OrderByDescending(kv => kv.Value)
                .First().Key;
            docRow.ClinicId = anchorClinicId;
            docRow.ClinicName = kpiClinicNames.GetValueOrDefault(anchorClinicId, string.Empty);
        }

        var topAbsenceDoctors = byDoctor.Values
            .Where(d => d.Absences > 0)
            .OrderByDescending(d => d.Absences)
            .ThenBy(d => d.UserName)
            .Take(5)
            .ToList();

        var perfectAttendanceDoctors = byDoctor.Values
            .Where(d => d.ComplianceRate >= 100.0 && d.Absences == 0)
            .OrderBy(d => d.UserName)
            .ToList();

        return new PrefeituraKpisResponse
        {
            From = fromUtc,
            To = toUtc,
            GlobalComplianceRate = totalExpected == 0 ? 0.0 : Math.Round(100.0 * totalCovered / totalExpected, 1),
            TotalExpectedShifts = totalExpected,
            TotalCoveredShifts = totalCovered,
            TotalAbsences = totalAbsences,
            TotalLateEvents = totalLate,
            AverageLateMinutes = totalLate == 0 ? 0.0 : Math.Round((double)totalLateMinutes / totalLate, 1),
            SubstitutionRate = totalExpected == 0 ? 0.0 : Math.Round(100.0 * substitutions.Count / totalExpected, 1),
            TotalActiveDoctors = byDoctor.Count,
            TotalActiveMedicos = byDoctor.Values.Count(d => d.ProfessionalType == nameof(ProfessionalType.Medico)),
            TotalActiveEnfermeiros = byDoctor.Values.Count(d => d.ProfessionalType == nameof(ProfessionalType.Enfermeiro)),
            ByClinic = byClinic.Values.OrderBy(c => c.ClinicName).ToList(),
            TopAbsenceDoctors = topAbsenceDoctors,
            PerfectAttendanceDoctors = perfectAttendanceDoctors,
        };
    }

    private static (DateTime From, DateTime To) NormalizePeriod(DateTime from, DateTime to)
    {
        // Aceita input em qualquer Kind. Ancoramos em UTC pra evitar
        // discrepância entre servidores em fusos diferentes.
        var f = DateTime.SpecifyKind(from.Date, DateTimeKind.Utc);
        var t = DateTime.SpecifyKind(to.Date == from.Date ? to.Date.AddDays(1) : to.Date, DateTimeKind.Utc);
        return f > t ? (t, f) : (f, t);
    }

    // ─────────────────────────────────────────────────────────────
    // Clinics — dropdown de filtros. TTL 5min.
    // ─────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<PrefeituraClinicItem>> GetClinicsAsync(CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);
        var cached = await _cache.GetOrSetAsync(
            CacheKeys.PrefeituraClinics(scope.OrganId),
            () => BuildClinicsAsync(scope),
            TimeSpan.FromMinutes(5),
            ct);
        return cached ?? await BuildClinicsAsync(scope);
    }

    private async Task<IReadOnlyList<PrefeituraClinicItem>> BuildClinicsAsync(PrefeituraScope scope)
    {
        if (scope.ClinicIds.Count == 0) return Array.Empty<PrefeituraClinicItem>();

        var clinics = await _clinicRepo.GetByIdsAsync(scope.ClinicIds);
        return clinics
            .OrderBy(c => c.Name)
            .Select(c => new PrefeituraClinicItem
            {
                ClinicId = c.Id,
                Name = c.Name,
                Address = c.Address,
                // Contract já vem carregado no Include do GetByIdsAsync.
                ContractNumber = c.Contract?.ContractNumber,
            })
            .ToList();
    }

    // ─────────────────────────────────────────────────────────────
    // Shifts — grade semanal. Sem cache (dado muda com edições no Admin OS).
    // ─────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<PrefeituraShiftItem>> GetShiftsAsync(
        DateTime from,
        DateTime to,
        Guid? clinicId = null,
        CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);
        var (fromUtc, toUtc) = NormalizePeriod(from, to);

        var targetClinicIds = clinicId.HasValue
            ? (scope.ClinicIds.Contains(clinicId.Value) ? new[] { clinicId.Value } : Array.Empty<Guid>())
            : scope.ClinicIds.ToArray();

        if (targetClinicIds.Length == 0) return Array.Empty<PrefeituraShiftItem>();

        var shifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(fromUtc, toUtc))
            .Where(s => targetClinicIds.Contains(s.ClinicId))
            .OrderBy(s => s.Date)
            .ThenBy(s => s.StartTime)
            .ToList();

        return shifts.Select(s => new PrefeituraShiftItem
        {
            ShiftId = s.Id,
            ClinicId = s.ClinicId,
            ClinicName = s.Clinic?.Name ?? string.Empty,
            Title = s.Title,
            Date = s.Date,
            StartTime = s.StartTime,
            EndTime = s.EndTime,
            CheckedInCount = s.Attendances.Count(a => s.ShiftAssignments.Any(sa => sa.UserId == a.UserId)),
            Assignments = s.ShiftAssignments
                .OrderBy(a => a.User?.Name)
                .Select(a => new PrefeituraShiftAssignment
                {
                    UserId = a.UserId,
                    UserName = a.User?.Name ?? string.Empty,
                    HasCheckedIn = s.Attendances.Any(att => att.UserId == a.UserId),
                })
                .ToList(),
        }).ToList();
    }

    // ─────────────────────────────────────────────────────────────
    // Weekly Schedule — grade UPA x dia x turno (op-escalas.html). Sem
    // cache (mesmo motivo do Shifts: dado muda com edições no Admin OS).
    // ─────────────────────────────────────────────────────────────

    public async Task<PrefeituraWeeklyScheduleResponse> GetWeeklyScheduleAsync(
        Guid clinicId,
        DateTime weekStart,
        CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);
        if (!scope.ClinicIds.Contains(clinicId))
        {
            throw new NotFoundException($"Clinic {clinicId} not found in scope.");
        }

        // Normaliza pro domingo da semana que contém weekStart.
        var anchor = DateTime.SpecifyKind(weekStart.Date, DateTimeKind.Utc);
        var dow = (int)anchor.DayOfWeek;
        var sunday = anchor.AddDays(-dow);
        var days = Enumerable.Range(0, 7).Select(i => sunday.AddDays(i)).ToList();
        var weekEndExclusive = sunday.AddDays(7);

        var settings = await _settingsRepo.GetAsync();
        var now = DateTime.UtcNow;

        var shifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(sunday, weekEndExclusive))
            .Where(s => s.ClinicId == clinicId)
            .ToList();

        var clinicName = shifts.FirstOrDefault()?.Clinic?.Name ?? string.Empty;
        int? doctorsPerShiftTarget = shifts.FirstOrDefault()?.Clinic?.DoctorsPerShift;
        if (clinicName == string.Empty || doctorsPerShiftTarget is null)
        {
            var clinic = (await _clinicRepo.GetByIdsAsync(new[] { clinicId })).FirstOrDefault();
            if (clinicName == string.Empty) clinicName = clinic?.Name ?? string.Empty;
            doctorsPerShiftTarget ??= clinic?.DoctorsPerShift;
        }

        // Agrupa por (StartTime, EndTime) — cada combinação distinta é uma
        // "linha" de turno na grade. Dentro de cada turno, agrupa por dia.
        var rows = shifts
            .GroupBy(s => (s.StartTime, s.EndTime))
            .OrderBy(g => g.Key.StartTime)
            .Select(turnoGroup =>
            {
                var cells = days.Select(day =>
                {
                    var dayShift = turnoGroup.FirstOrDefault(s => s.Date.Date == day.Date);
                    var assignments = new List<PrefeituraScheduleAssignment>();
                    if (dayShift is not null)
                    {
                        var shiftStartUtc = ShiftStartUtc(dayShift);
                        var isFutureShift = shiftStartUtc > now;
                        foreach (var a in dayShift.ShiftAssignments)
                        {
                            // Heurística documentada no DTO: assignment com
                            // menos de 48h de idade em turno futuro = pendente.
                            var isPending = isFutureShift && (now - a.AssignedAt) < TimeSpan.FromHours(48);
                            assignments.Add(new PrefeituraScheduleAssignment
                            {
                                UserId = a.UserId,
                                UserName = a.User?.Name ?? string.Empty,
                                ProfessionalType = ProfessionalTypeLabel(a.User?.ProfessionalType),
                                Status = isPending ? "pendente" : "confirmado",
                            });
                        }
                    }

                    // "Sem cobertura" só se aplica quando existe de fato um
                    // Shift agendado pra esse dia+turno — dias sem Shift
                    // simplesmente não têm plantão previsto ali, não é uma
                    // vaga em aberto.
                    var target = doctorsPerShiftTarget ?? 0;
                    var uncovered = dayShift is null ? 0 : Math.Max(0, target - assignments.Count);

                    return new PrefeituraScheduleCell
                    {
                        Date = day,
                        Assignments = assignments,
                        UncoveredCount = uncovered,
                    };
                }).ToList();

                return new PrefeituraScheduleRow
                {
                    Turno = DeriveTurno(turnoGroup.Key.StartTime),
                    StartTime = turnoGroup.Key.StartTime,
                    EndTime = turnoGroup.Key.EndTime,
                    Cells = cells,
                };
            })
            .ToList();

        var totalConfirmed = rows.Sum(r => r.Cells.Sum(c => c.Assignments.Count(a => a.Status == "confirmado")));
        var totalPending = rows.Sum(r => r.Cells.Sum(c => c.Assignments.Count(a => a.Status == "pendente")));
        var totalUncovered = rows.Sum(r => r.Cells.Sum(c => c.UncoveredCount));
        var totalShiftSlots = rows.Sum(r => r.Cells.Count);
        var totalDoctors = rows
            .SelectMany(r => r.Cells)
            .SelectMany(c => c.Assignments)
            .Select(a => a.UserId)
            .Distinct()
            .Count();

        return new PrefeituraWeeklyScheduleResponse
        {
            ClinicId = clinicId,
            ClinicName = clinicName,
            DoctorsPerShiftTarget = doctorsPerShiftTarget,
            WeekStart = sunday,
            WeekEnd = sunday.AddDays(6),
            Days = days,
            TotalShiftSlots = totalShiftSlots,
            TotalConfirmed = totalConfirmed,
            TotalPending = totalPending,
            TotalUncovered = totalUncovered,
            TotalDoctors = totalDoctors,
            Rows = rows,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Unit Timeline — plantões de UMA UPA (op-historico.html). Sem cache
    // (mesmo motivo do Shifts: dado muda com edições no Admin OS).
    // ─────────────────────────────────────────────────────────────

    public async Task<PrefeituraUnitTimelineResponse> GetUnitTimelineAsync(
        Guid clinicId,
        DateTime from,
        DateTime to,
        string? turno = null,
        CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);
        if (!scope.ClinicIds.Contains(clinicId))
        {
            // NotFoundException (não Forbidden) — não vaza existência de
            // clínicas fora do escopo do gestor, mesmo padrão de NotifyOs.
            throw new NotFoundException($"Clinic {clinicId} not found in scope.");
        }

        var (fromUtc, toUtc) = NormalizePeriod(from, to);
        var settings = await _settingsRepo.GetAsync();
        var now = DateTime.UtcNow;

        var shifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(fromUtc, toUtc))
            .Where(s => s.ClinicId == clinicId)
            .ToList();

        var clinicName = shifts.FirstOrDefault()?.Clinic?.Name
            ?? (await _clinicRepo.GetByIdsAsync(new[] { clinicId })).FirstOrDefault()?.Name
            ?? string.Empty;

        var normalizedTurno = string.IsNullOrWhiteSpace(turno) ? null : turno.Trim().ToLowerInvariant();

        var items = new List<PrefeituraUnitTimelineItem>();
        foreach (var s in shifts)
        {
            var shiftTurno = DeriveTurno(s.StartTime);
            if (normalizedTurno is not null && shiftTurno != normalizedTurno) continue;

            foreach (var assignment in s.ShiftAssignments)
            {
                var attendance = s.Attendances.FirstOrDefault(a => a.UserId == assignment.UserId);
                if (attendance is null)
                {
                    if (!ShiftAlreadyPastAbsenceThreshold(s, now, settings)) continue;
                    items.Add(new PrefeituraUnitTimelineItem
                    {
                        ShiftId = s.Id,
                        UserId = assignment.UserId,
                        UserName = assignment.User?.Name ?? string.Empty,
                        ProfessionalType = ProfessionalTypeLabel(assignment.User?.ProfessionalType),
                        Date = s.Date,
                        Turno = shiftTurno,
                        ExpectedTime = s.StartTime,
                        CheckInTime = null,
                        CheckOutTime = null,
                        Type = "absent",
                        MinutesLate = null,
                    });
                }
                else
                {
                    var late = IsLate(attendance, s, settings);
                    items.Add(new PrefeituraUnitTimelineItem
                    {
                        ShiftId = s.Id,
                        UserId = assignment.UserId,
                        UserName = assignment.User?.Name ?? string.Empty,
                        ProfessionalType = ProfessionalTypeLabel(assignment.User?.ProfessionalType),
                        Date = s.Date,
                        Turno = shiftTurno,
                        ExpectedTime = s.StartTime,
                        CheckInTime = attendance.CheckInTime,
                        CheckOutTime = attendance.CheckOutTime,
                        Type = late ? "late" : "in",
                        MinutesLate = late ? LateMinutes(attendance, s, settings) : null,
                    });
                }
            }
        }

        items = items.OrderByDescending(i => i.Date).ThenBy(i => i.UserName).ToList();

        return new PrefeituraUnitTimelineResponse
        {
            ClinicId = clinicId,
            ClinicName = clinicName,
            From = fromUtc,
            To = toUtc,
            TotalShifts = items.Count,
            Entradas = items.Count(i => i.Type is "in" or "late"),
            Saidas = items.Count(i => i.CheckOutTime.HasValue),
            Atrasos = items.Count(i => i.Type == "late"),
            Ausencias = items.Count(i => i.Type == "absent"),
            Items = items,
        };
    }

    /// <summary>
    /// Deriva o "turno" a partir do horário de início — não existe esse
    /// conceito no domínio (Shift só tem StartTime/EndTime). Heurística:
    /// 05:00-12:59 manhã, 13:00-18:59 tarde, resto noite. Ver op-historico.html
    /// que usa "Manhã (07h–19h)" / "Noite (19h–07h)" como rótulos no filtro.
    /// </summary>
    private static string DeriveTurno(TimeSpan startTime)
    {
        var hour = startTime.Hours;
        if (hour is >= 5 and < 13) return "manha";
        if (hour is >= 13 and < 19) return "tarde";
        return "noite";
    }

    // ─────────────────────────────────────────────────────────────
    // Frequency — previsto x realizado por (UPA, dia). TTL 60s.
    // ─────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<PrefeituraFrequencyItem>> GetFrequencyAsync(
        DateTime from,
        DateTime to,
        Guid? clinicId = null,
        CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);
        var (fromUtc, toUtc) = NormalizePeriod(from, to);

        var cached = await _cache.GetOrSetAsync(
            CacheKeys.PrefeituraFrequency(scope.OrganId, fromUtc, toUtc, clinicId),
            () => BuildFrequencyAsync(scope, fromUtc, toUtc, clinicId),
            TimeSpan.FromSeconds(60),
            ct);

        return cached ?? await BuildFrequencyAsync(scope, fromUtc, toUtc, clinicId);
    }

    private async Task<IReadOnlyList<PrefeituraFrequencyItem>> BuildFrequencyAsync(
        PrefeituraScope scope,
        DateTime fromUtc,
        DateTime toUtc,
        Guid? clinicId)
    {
        var targetClinicIds = clinicId.HasValue
            ? (scope.ClinicIds.Contains(clinicId.Value) ? new[] { clinicId.Value } : Array.Empty<Guid>())
            : scope.ClinicIds.ToArray();

        if (targetClinicIds.Length == 0) return Array.Empty<PrefeituraFrequencyItem>();

        var shifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(fromUtc, toUtc))
            .Where(s => targetClinicIds.Contains(s.ClinicId))
            .ToList();

        // Agrupa por (clinicId, date). Cada shift adiciona (Expected = qtd
        // assignments) e (Actual = qtd assignments com attendance).
        var grouped = shifts
            .GroupBy(s => (s.ClinicId, Date: s.Date.Date))
            .Select(g => new PrefeituraFrequencyItem
            {
                ClinicId = g.Key.ClinicId,
                ClinicName = g.First().Clinic?.Name ?? string.Empty,
                Date = g.Key.Date,
                Expected = g.Sum(s => s.ShiftAssignments.Count),
                Actual = g.Sum(s => s.ShiftAssignments.Count(a => s.Attendances.Any(att => att.UserId == a.UserId))),
            })
            .OrderBy(item => item.Date)
            .ThenBy(item => item.ClinicName)
            .ToList();

        foreach (var item in grouped)
        {
            item.PresenceRate = item.Expected == 0
                ? 0.0
                : Math.Round(100.0 * item.Actual / item.Expected, 1);
        }

        return grouped;
    }

    // ─────────────────────────────────────────────────────────────
    // Frequency by doctor — tabela "Frequência por Médico". TTL 60s.
    // ─────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<PrefeituraFrequencyByDoctorItem>> GetFrequencyByDoctorAsync(
        DateTime from,
        DateTime to,
        Guid? clinicId = null,
        CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);
        var (fromUtc, toUtc) = NormalizePeriod(from, to);

        var cached = await _cache.GetOrSetAsync(
            CacheKeys.PrefeituraFrequencyByDoctor(scope.OrganId, fromUtc, toUtc, clinicId),
            () => BuildFrequencyByDoctorAsync(scope, fromUtc, toUtc, clinicId),
            TimeSpan.FromSeconds(60),
            ct);

        return cached ?? await BuildFrequencyByDoctorAsync(scope, fromUtc, toUtc, clinicId);
    }

    private async Task<IReadOnlyList<PrefeituraFrequencyByDoctorItem>> BuildFrequencyByDoctorAsync(
        PrefeituraScope scope,
        DateTime fromUtc,
        DateTime toUtc,
        Guid? clinicId)
    {
        var targetClinicIds = clinicId.HasValue
            ? (scope.ClinicIds.Contains(clinicId.Value) ? new[] { clinicId.Value } : Array.Empty<Guid>())
            : scope.ClinicIds.ToArray();

        if (targetClinicIds.Length == 0) return Array.Empty<PrefeituraFrequencyByDoctorItem>();

        var settings = await _settingsRepo.GetAsync();
        var now = DateTime.UtcNow;

        var shifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(fromUtc, toUtc))
            .Where(s => targetClinicIds.Contains(s.ClinicId))
            .ToList();

        // Acumuladores por médico. ClinicCounts rastreia em qual UPA o
        // médico apareceu mais vezes — usado só pra exibir uma UPA "âncora"
        // na tabela quando o profissional atua em múltiplas unidades.
        var byDoctor = new Dictionary<Guid, PrefeituraFrequencyByDoctorItem>();
        var clinicCounts = new Dictionary<Guid, Dictionary<Guid, int>>();

        foreach (var s in shifts)
        {
            foreach (var assignment in s.ShiftAssignments)
            {
                var userId = assignment.UserId;
                if (!byDoctor.TryGetValue(userId, out var row))
                {
                    row = new PrefeituraFrequencyByDoctorItem
                    {
                        UserId = userId,
                        UserName = assignment.User?.Name ?? string.Empty,
                        RegistrationNumber = assignment.User?.RegistrationNumber,
                        ProfessionalType = ProfessionalTypeLabel(assignment.User?.ProfessionalType),
                    };
                    byDoctor[userId] = row;
                    clinicCounts[userId] = new Dictionary<Guid, int>();
                }

                row.ExpectedShifts++;
                clinicCounts[userId][s.ClinicId] = clinicCounts[userId].GetValueOrDefault(s.ClinicId) + 1;

                var attendance = s.Attendances.FirstOrDefault(a => a.UserId == userId);
                if (attendance is null)
                {
                    if (ShiftAlreadyPastAbsenceThreshold(s, now, settings)) row.Absences++;
                }
                else
                {
                    row.CompletedShifts++;
                    if (IsLate(attendance, s, settings)) row.LateEvents++;
                }
            }
        }

        var clinicNames = shifts
            .Select(s => (s.ClinicId, Name: s.Clinic?.Name ?? string.Empty))
            .Distinct()
            .ToDictionary(x => x.ClinicId, x => x.Name);

        foreach (var row in byDoctor.Values)
        {
            row.ComplianceRate = row.ExpectedShifts == 0
                ? 0.0
                : Math.Round(100.0 * row.CompletedShifts / row.ExpectedShifts, 1);

            var anchorClinicId = clinicCounts[row.UserId]
                .OrderByDescending(kv => kv.Value)
                .First().Key;
            row.ClinicId = anchorClinicId;
            row.ClinicName = clinicNames.GetValueOrDefault(anchorClinicId, string.Empty);
        }

        return byDoctor.Values
            .OrderBy(r => r.UserName)
            .ToList();
    }

    // ─────────────────────────────────────────────────────────────
    // Absences — ausências + atrasos. Filtro type: "late" | "absence" | null. TTL 60s.
    // ─────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<PrefeituraAbsenceItem>> GetAbsencesAsync(
        DateTime from,
        DateTime to,
        string? type = null,
        CancellationToken ct = default,
        int? toleranceOverrideMinutes = null)
    {
        var scope = await ResolveScopeAsync(ct);
        var (fromUtc, toUtc) = NormalizePeriod(from, to);
        var normalizedType = string.IsNullOrWhiteSpace(type) ? null : type.Trim().ToLowerInvariant();

        // Override de tolerância (slider da tela Atrasos) não passa pelo
        // cache — é uma simulação ad-hoc, não o dado "real" da clínica.
        if (toleranceOverrideMinutes.HasValue)
        {
            return await BuildAbsencesAsync(scope, fromUtc, toUtc, normalizedType, toleranceOverrideMinutes);
        }

        var cached = await _cache.GetOrSetAsync(
            CacheKeys.PrefeituraAbsences(scope.OrganId, fromUtc, toUtc, normalizedType),
            () => BuildAbsencesAsync(scope, fromUtc, toUtc, normalizedType, null),
            TimeSpan.FromSeconds(60),
            ct);

        return cached ?? await BuildAbsencesAsync(scope, fromUtc, toUtc, normalizedType, null);
    }

    private async Task<IReadOnlyList<PrefeituraAbsenceItem>> BuildAbsencesAsync(
        PrefeituraScope scope,
        DateTime fromUtc,
        DateTime toUtc,
        string? type,
        int? toleranceOverrideMinutes)
    {
        if (scope.ClinicIds.Count == 0) return Array.Empty<PrefeituraAbsenceItem>();
        var settings = await _settingsRepo.GetAsync();
        var now = DateTime.UtcNow;

        // Substituições dão o vínculo "coberto por X" + a origem da ausência.
        var subs = (await _substitutionRepo.GetByClinicIdsAsync(scope.ClinicIds))
            .Where(s => s.ShiftDate >= fromUtc.Date && s.ShiftDate < toUtc.Date)
            .ToList();

        // Todas as justificativas do período (não só aprovadas) — a versão
        // "aprovada apenas" (usada pra Justified abaixo) fica calculada
        // separadamente; aqui pegamos o conjunto completo pra derivar a
        // situação granular (sem-justificativa/pendente/em-análise/resolvido).
        var allJustifications = (await _justificationRepo.GetByClinicIdsAsync(scope.ClinicIds))
            .Where(j => j.ShiftDate >= fromUtc.Date && j.ShiftDate < toUtc.Date)
            .ToList();
        var justifications = allJustifications
            .Where(j => j.Status == JustificationStatus.Approved)
            .ToList();

        var shifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(fromUtc, toUtc))
            .Where(s => scope.ClinicIds.Contains(s.ClinicId))
            .ToList();

        var items = new List<PrefeituraAbsenceItem>();

        foreach (var s in shifts)
        {
            foreach (var assignment in s.ShiftAssignments)
            {
                var attendance = s.Attendances.FirstOrDefault(a => a.UserId == assignment.UserId);
                var relatedSub = subs.FirstOrDefault(sub =>
                    sub.ClinicId == s.ClinicId &&
                    sub.ShiftDate.Date == s.Date.Date &&
                    sub.AbsentUserId == assignment.UserId);

                var justified = justifications.Any(j =>
                    j.ClinicId == s.ClinicId &&
                    j.ShiftDate.Date == s.Date.Date &&
                    j.AbsentUserId == assignment.UserId);

                if (attendance is null)
                {
                    if (!ShiftAlreadyPastAbsenceThreshold(s, now, settings)) continue;
                    if (type == "late") continue;
                    var relatedJustification = allJustifications.FirstOrDefault(j =>
                        j.ClinicId == s.ClinicId &&
                        j.ShiftDate.Date == s.Date.Date &&
                        j.AbsentUserId == assignment.UserId);
                    var status = DeriveAbsenceStatus(relatedJustification, relatedSub);
                    items.Add(BuildAbsenceItem(assignment, s, "absence", null, justified, relatedSub, status));
                }
                else if (IsLate(attendance, s, settings, toleranceOverrideMinutes))
                {
                    if (type == "absence") continue;
                    items.Add(BuildAbsenceItem(assignment, s, "late",
                        LateMinutes(attendance, s, settings, toleranceOverrideMinutes), justified, relatedSub, null));
                }
            }
        }

        return items
            .OrderByDescending(i => i.Date)
            .ThenBy(i => i.ClinicName)
            .ToList();
    }

    /// <summary>
    /// Deriva a situação granular do mock op-ausencias.html a partir do
    /// estado real de Justification/Substitution — nenhum campo novo de
    /// domínio, só uma leitura combinada do que já existe:
    ///   - Justification Approved/Rejected → "resolvido" (OS já decidiu).
    ///   - Substitution Confirmed (sem justification decisiva) → "resolvido".
    ///   - Justification Pending/UnderAnalysis → "em-analise".
    ///   - Substitution Pending (sem justification) → "pendente".
    ///   - Nada registrado → "sem-justificativa".
    /// </summary>
    private static string DeriveAbsenceStatus(Justification? justification, Substitution? substitution)
    {
        if (justification is not null)
        {
            return justification.Status is JustificationStatus.Approved or JustificationStatus.Rejected
                ? "resolvido"
                : "em-analise";
        }

        if (substitution is not null)
        {
            return substitution.Status == SubstitutionStatus.Confirmed ? "resolvido" : "pendente";
        }

        return "sem-justificativa";
    }

    private static PrefeituraAbsenceItem BuildAbsenceItem(
        ShiftAssignment assignment,
        Shift shift,
        string type,
        int? lateMinutes,
        bool justified,
        Substitution? relatedSub,
        string? status) => new()
        {
            // Chave estável: hash de (shiftId, userId, type). Facilita
            // reconciliação no frontend sem persistir a "ausência" como entity.
            Id = DeriveAbsenceId(shift.Id, assignment.UserId, type),
            Type = type,
            UserId = assignment.UserId,
            UserName = assignment.User?.Name ?? string.Empty,
            ProfessionalType = ProfessionalTypeLabel(assignment.User?.ProfessionalType),
            ClinicId = shift.ClinicId,
            ClinicName = shift.Clinic?.Name ?? string.Empty,
            Date = shift.Date,
            ShiftLabel = $"{shift.Title} ({shift.StartTime:hh\\:mm}–{shift.EndTime:hh\\:mm})",
            MinutesLate = lateMinutes,
            Justified = justified,
            SubstituteName = relatedSub?.SubstituteUser?.Name,
            Status = status,
        };

    private static Guid DeriveAbsenceId(Guid shiftId, Guid userId, string type)
    {
        // Hash determinístico dos 3 componentes — combinaria mais 1 byte
        // pra "late" vs "absence" mas GUID de 16 bytes cabe tudo.
        Span<byte> bytes = stackalloc byte[16];
        var sBytes = shiftId.ToByteArray();
        var uBytes = userId.ToByteArray();
        for (int i = 0; i < 16; i++) bytes[i] = (byte)(sBytes[i] ^ uBytes[i]);
        // Ultimo byte carrega o tipo (0=absence, 1=late).
        bytes[15] ^= (byte)(type == "late" ? 1 : 0);
        return new Guid(bytes);
    }

    // ─────────────────────────────────────────────────────────────
    // History — timeline paginada. Sem cache (paginação + filtros ad-hoc).
    // ─────────────────────────────────────────────────────────────

    public async Task<PrefeituraHistoryPage> GetHistoryAsync(
        DateTime from,
        DateTime to,
        string? type = null,
        string? search = null,
        int page = 1,
        int pageSize = 30,
        CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);
        var (fromUtc, toUtc) = NormalizePeriod(from, to);
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 30 : pageSize;

        if (scope.ClinicIds.Count == 0)
        {
            return new PrefeituraHistoryPage { Page = page, PageSize = pageSize };
        }

        var events = new List<PrefeituraHistoryItem>();
        var normalizedType = string.IsNullOrWhiteSpace(type) ? null : type.Trim().ToLowerInvariant();

        // Check-ins (source = attendances).
        if (normalizedType is null or "checkin")
        {
            foreach (var clinicId in scope.ClinicIds)
            {
                foreach (var att in await _attendanceRepo.GetByClinicAndDateRangeAsync(clinicId, fromUtc, toUtc))
                {
                    events.Add(new PrefeituraHistoryItem
                    {
                        Timestamp = att.CheckInTime,
                        Type = "checkin",
                        Title = $"Check-in {att.User?.Name}",
                        Details = att.CheckOutTime.HasValue ? $"Check-out {att.CheckOutTime:HH:mm}" : null,
                        UserId = att.UserId,
                        UserName = att.User?.Name,
                        ClinicId = att.ClinicId,
                        ClinicName = att.Clinic?.Name,
                    });
                }
            }
        }

        // Substituições.
        if (normalizedType is null or "substitution")
        {
            foreach (var sub in await _substitutionRepo.GetByClinicIdsAsync(scope.ClinicIds))
            {
                if (sub.CreatedAt < fromUtc || sub.CreatedAt >= toUtc) continue;
                events.Add(new PrefeituraHistoryItem
                {
                    Timestamp = sub.CreatedAt,
                    Type = "substitution",
                    Title = $"Substituição — {sub.AbsentUser?.Name}",
                    Details = sub.SubstituteUser is null ? "Sem substituto" : $"Coberto por {sub.SubstituteUser.Name}",
                    UserId = sub.AbsentUserId,
                    UserName = sub.AbsentUser?.Name,
                    ClinicId = sub.ClinicId,
                    ClinicName = sub.Clinic?.Name,
                });
            }
        }

        // Justificativas.
        if (normalizedType is null or "justification")
        {
            foreach (var j in await _justificationRepo.GetByClinicIdsAsync(scope.ClinicIds))
            {
                if (j.CreatedAt < fromUtc || j.CreatedAt >= toUtc) continue;
                events.Add(new PrefeituraHistoryItem
                {
                    Timestamp = j.CreatedAt,
                    Type = "justification",
                    Title = $"Justificativa {j.ProtocolNumber}",
                    Details = j.Status.ToString(),
                    UserId = j.AbsentUserId,
                    ClinicId = j.ClinicId,
                });
            }
        }

        // Alertas.
        if (normalizedType is null or "alert")
        {
            foreach (var a in await _alertRepo.GetByClinicIdsAsync(scope.ClinicIds, includeGlobal: false))
            {
                if (a.CreatedAt < fromUtc || a.CreatedAt >= toUtc) continue;
                events.Add(new PrefeituraHistoryItem
                {
                    Timestamp = a.CreatedAt,
                    Type = "alert",
                    Title = a.Title,
                    Details = a.Code,
                    ClinicId = a.ClinicId,
                    ClinicName = a.Clinic?.Name,
                });
            }
        }

        // Busca textual em cima do resultado agregado (dataset é curto).
        if (!string.IsNullOrWhiteSpace(search))
        {
            var needle = search.Trim();
            events = events
                .Where(e =>
                    (e.Title?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (e.UserName?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (e.ClinicName?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (e.Details?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false))
                .ToList();
        }

        var ordered = events.OrderByDescending(e => e.Timestamp).ToList();
        var pageItems = ordered.Skip((page - 1) * pageSize).Take(pageSize).ToList();

        return new PrefeituraHistoryPage
        {
            Items = pageItems,
            Page = page,
            PageSize = pageSize,
            TotalCount = ordered.Count,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Realtime — snapshot ao vivo por UPA. TTL 15s.
    // ─────────────────────────────────────────────────────────────

    public async Task<PrefeituraRealtimeResponse> GetRealtimeAsync(CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);

        var cached = await _cache.GetOrSetAsync(
            CacheKeys.PrefeituraRealtime(scope.OrganId),
            () => BuildRealtimeAsync(scope),
            TimeSpan.FromSeconds(15),
            ct);

        return cached ?? await BuildRealtimeAsync(scope);
    }

    private async Task<PrefeituraRealtimeResponse> BuildRealtimeAsync(PrefeituraScope scope)
    {
        var now = DateTime.UtcNow;
        var settings = await _settingsRepo.GetAsync();
        var response = new PrefeituraRealtimeResponse { AsOf = now };

        if (scope.ClinicIds.Count == 0) return response;

        var startOfDay = DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);
        var endOfDay = startOfDay.AddDays(1);

        // Shifts de hoje no escopo. O filtro "em andamento agora" (inWindow)
        // é aplicado por-shift abaixo pra popular os cards por-UPA; já o
        // feed de eventos recentes considera TODOS os shifts de hoje (não só
        // os em andamento), pra também mostrar check-ins de turnos que já
        // terminaram — overnight simplificado, mesmo débito documentado nos
        // outros métodos deste service.
        var todaysShifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(startOfDay, endOfDay))
            .Where(s => scope.ClinicIds.Contains(s.ClinicId))
            .ToList();

        var clinics = (await _clinicRepo.GetByIdsAsync(scope.ClinicIds)).ToList();
        var byClinic = clinics.ToDictionary(c => c.Id, c => new PrefeituraRealtimeClinic
        {
            ClinicId = c.Id,
            Name = c.Name,
        });

        var recentEvents = new List<PrefeituraRealtimeEvent>();

        foreach (var s in todaysShifts)
        {
            if (!byClinic.TryGetValue(s.ClinicId, out var card)) continue;
            var shiftStart = ShiftStartUtc(s);
            var shiftEnd = shiftStart.Add(s.EndTime - s.StartTime);
            if (shiftEnd <= shiftStart) shiftEnd = shiftEnd.AddDays(1); // overnight

            // Feed de eventos — independe da janela "em andamento".
            foreach (var assignment in s.ShiftAssignments)
            {
                var attendance = s.Attendances.FirstOrDefault(a => a.UserId == assignment.UserId);
                var userName = assignment.User?.Name;
                if (attendance is not null)
                {
                    var late = IsLate(attendance, s, settings);
                    recentEvents.Add(new PrefeituraRealtimeEvent
                    {
                        Timestamp = attendance.CheckInTime,
                        Type = late ? "late" : "checkin",
                        UserId = assignment.UserId,
                        UserName = userName,
                        ClinicName = s.Clinic?.Name,
                        MinutesLate = late ? LateMinutes(attendance, s, settings) : null,
                    });
                    if (attendance.CheckOutTime.HasValue)
                    {
                        recentEvents.Add(new PrefeituraRealtimeEvent
                        {
                            Timestamp = attendance.CheckOutTime.Value,
                            Type = "checkout",
                            UserId = assignment.UserId,
                            UserName = userName,
                            ClinicName = s.Clinic?.Name,
                        });
                    }
                }
                else if (ShiftAlreadyPastAbsenceThreshold(s, now, settings))
                {
                    recentEvents.Add(new PrefeituraRealtimeEvent
                    {
                        Timestamp = shiftStart.AddMinutes(settings.AbsenceThresholdMinutes),
                        Type = "absence",
                        UserId = assignment.UserId,
                        UserName = userName,
                        ClinicName = s.Clinic?.Name,
                    });
                }
            }

            var inWindow = now >= shiftStart && now < shiftEnd;
            if (!inWindow) continue;

            card.TurnoCode ??= DeriveTurno(s.StartTime);
            card.ShiftStartTime ??= s.StartTime;
            card.ShiftEndTime ??= s.EndTime;

            foreach (var assignment in s.ShiftAssignments)
            {
                card.ExpectedCount++;
                var attendance = s.Attendances.FirstOrDefault(a => a.UserId == assignment.UserId);
                var doctor = new PrefeituraRealtimeDoctor
                {
                    UserId = assignment.UserId,
                    UserName = assignment.User?.Name ?? string.Empty,
                    RegistrationNumber = assignment.User?.RegistrationNumber,
                    ProfessionalType = ProfessionalTypeLabel(assignment.User?.ProfessionalType),
                    ExpectedTime = shiftStart,
                };

                if (attendance is { CheckOutTime: null })
                {
                    card.PresentCount++;
                    var late = IsLate(attendance, s, settings);
                    doctor.Status = late ? "late" : "present";
                    doctor.CheckInTime = attendance.CheckInTime;
                    if (late) card.LateCount++;

                    if (card.LastEventTime is null || attendance.CheckInTime > card.LastEventTime)
                    {
                        card.LastEventUserName = doctor.UserName;
                        card.LastEventType = "checkin";
                        card.LastEventTime = attendance.CheckInTime;
                    }
                }
                else if (attendance is null && ShiftAlreadyPastAbsenceThreshold(s, now, settings))
                {
                    card.AbsentCount++;
                    doctor.Status = "absent";
                    if (assignment.User is not null)
                    {
                        card.AbsentUserNames.Add(assignment.User.Name);
                    }

                    var absenceTime = shiftStart.AddMinutes(settings.AbsenceThresholdMinutes);
                    if (card.LastEventTime is null || absenceTime > card.LastEventTime)
                    {
                        card.LastEventUserName = doctor.UserName;
                        card.LastEventType = "absence";
                        card.LastEventTime = absenceTime;
                    }
                }
                else if (attendance is not null)
                {
                    // Check-out já feito dentro da janela do turno em andamento
                    // (raro, mas possível pra turnos curtos) — conta como presente.
                    card.PresentCount++;
                    doctor.Status = IsLate(attendance, s, settings) ? "late" : "present";
                    doctor.CheckInTime = attendance.CheckInTime;
                }
                else
                {
                    doctor.Status = "upcoming";
                }

                card.Doctors.Add(doctor);
            }
        }

        foreach (var card in byClinic.Values)
        {
            card.AlertLevel = card.ExpectedCount == 0
                ? "green"
                : card.AbsentCount > 0 ? "red"
                : card.PresentCount == card.ExpectedCount ? "green"
                : "yellow";
        }

        response.Clinics = byClinic.Values
            .OrderBy(c => c.Name)
            .ToList();
        response.TotalClinics = response.Clinics.Count;
        response.TotalExpectedNow = response.Clinics.Sum(c => c.ExpectedCount);
        response.TotalPresentNow = response.Clinics.Sum(c => c.PresentCount);
        response.TotalAbsentNow = response.Clinics.Sum(c => c.AbsentCount);
        response.TotalLateNow = response.Clinics.Sum(c => c.LateCount);
        response.RecentEvents = recentEvents
            .OrderByDescending(e => e.Timestamp)
            .Take(20)
            .ToList();

        return response;
    }

    // ─────────────────────────────────────────────────────────────
    // Acionar OS — única mutação do portal. Reusa AlertService.
    // ─────────────────────────────────────────────────────────────

    public async Task<Guid> NotifyOsAboutAbsenceAsync(
        Guid shiftId,
        Guid userId,
        string? message,
        CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);

        // 1) O shift precisa existir e estar em uma clínica do escopo do gestor.
        //    NotFoundException (não 403) para não vazar existência de recursos
        //    fora do organ. Mesmo padrão do design.md § "Error Handling".
        var shift = await _shiftRepo.GetByIdAsync(shiftId);
        if (shift is null || !scope.ClinicIds.Contains(shift.ClinicId))
        {
            throw new NotFoundException("Absence not found in scope");
        }

        // 2) Precisa haver um assignment pra esse (user, shift) — sinaliza que
        //    o profissional foi escalado ali. Se não estava escalado, não é
        //    uma ausência acionável (é dado inconsistente ou tentativa de spam).
        var assignment = shift.ShiftAssignments.FirstOrDefault(a => a.UserId == userId);
        if (assignment is null)
        {
            throw new NotFoundException("Absence not found in scope");
        }

        // 3) Delega ao AlertService — que valida tenant, gera Code auto,
        //    persiste com CreatedAt, retorna AlertResponse já pronto.
        var userName = assignment.User?.Name ?? "profissional";
        var shiftLabel = $"{shift.Title} ({shift.StartTime:hh\\:mm}–{shift.EndTime:hh\\:mm})";

        var descriptionParts = new List<string>
        {
            $"Ausência acionada pela Prefeitura: <strong>{userName}</strong> escalado para <strong>{shiftLabel}</strong> em {shift.Date:dd/MM/yyyy}.",
        };
        if (!string.IsNullOrWhiteSpace(message))
        {
            descriptionParts.Add($"Observação do gestor: {message.Trim()}");
        }

        var response = await _alertService.CreateAsync(new CreateAlertRequest
        {
            Level = AlertLevel.Critical,
            Type = AlertType.UnannouncedAbsence,
            Title = $"Ausência acionada pela Prefeitura — {userName}",
            Description = string.Join(" ", descriptionParts),
            ClinicId = shift.ClinicId,
            RelatedUserId = userId,
            PrimaryActionLabel = "Ver escalas",
            SecondaryActionLabel = "Registrar substituição",
        });

        return response.Id;
    }
}
