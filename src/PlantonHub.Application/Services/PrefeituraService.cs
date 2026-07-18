using PlantonHub.Application.Constants;
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
        ISettingsRepository settingsRepo)
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

    private static bool IsLate(Attendance a, Shift s, SystemSettings settings)
    {
        var toleranceMinutes = s.Clinic?.CheckInToleranceMinutes ?? settings.CheckInToleranceMinutes;
        return a.CheckInTime > ShiftStartUtc(s).AddMinutes(toleranceMinutes);
    }

    private static int LateMinutes(Attendance a, Shift s, SystemSettings settings)
    {
        var toleranceMinutes = s.Clinic?.CheckInToleranceMinutes ?? settings.CheckInToleranceMinutes;
        var threshold = ShiftStartUtc(s).AddMinutes(toleranceMinutes);
        var diff = (a.CheckInTime - threshold).TotalMinutes;
        return diff <= 0 ? 0 : (int)Math.Round(diff);
    }

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
                var attendance = s.Attendances.FirstOrDefault(a => a.UserId == assignment.UserId);
                if (attendance is null)
                {
                    if (ShiftAlreadyPastAbsenceThreshold(s, DateTime.UtcNow, settings))
                    {
                        row.Absences++;
                        totalAbsences++;
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
            ByClinic = byClinic.Values.OrderBy(c => c.ClinicName).ToList(),
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
    // Absences — ausências + atrasos. Filtro type: "late" | "absence" | null. TTL 60s.
    // ─────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<PrefeituraAbsenceItem>> GetAbsencesAsync(
        DateTime from,
        DateTime to,
        string? type = null,
        CancellationToken ct = default)
    {
        var scope = await ResolveScopeAsync(ct);
        var (fromUtc, toUtc) = NormalizePeriod(from, to);
        var normalizedType = string.IsNullOrWhiteSpace(type) ? null : type.Trim().ToLowerInvariant();

        var cached = await _cache.GetOrSetAsync(
            CacheKeys.PrefeituraAbsences(scope.OrganId, fromUtc, toUtc, normalizedType),
            () => BuildAbsencesAsync(scope, fromUtc, toUtc, normalizedType),
            TimeSpan.FromSeconds(60),
            ct);

        return cached ?? await BuildAbsencesAsync(scope, fromUtc, toUtc, normalizedType);
    }

    private async Task<IReadOnlyList<PrefeituraAbsenceItem>> BuildAbsencesAsync(
        PrefeituraScope scope,
        DateTime fromUtc,
        DateTime toUtc,
        string? type)
    {
        if (scope.ClinicIds.Count == 0) return Array.Empty<PrefeituraAbsenceItem>();
        var settings = await _settingsRepo.GetAsync();
        var now = DateTime.UtcNow;

        // Substituições dão o vínculo "coberto por X" + a origem da ausência.
        var subs = (await _substitutionRepo.GetByClinicIdsAsync(scope.ClinicIds))
            .Where(s => s.ShiftDate >= fromUtc.Date && s.ShiftDate < toUtc.Date)
            .ToList();

        // Justificativas aceitas neutralizam a linha (Justified = true).
        var justifications = (await _justificationRepo.GetByClinicIdsAsync(scope.ClinicIds))
            .Where(j => j.ShiftDate >= fromUtc.Date && j.ShiftDate < toUtc.Date
                     && j.Status == JustificationStatus.Approved)
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
                    items.Add(BuildAbsenceItem(assignment, s, "absence", null, justified, relatedSub));
                }
                else if (IsLate(attendance, s, settings))
                {
                    if (type == "absence") continue;
                    items.Add(BuildAbsenceItem(assignment, s, "late",
                        LateMinutes(attendance, s, settings), justified, relatedSub));
                }
            }
        }

        return items
            .OrderByDescending(i => i.Date)
            .ThenBy(i => i.ClinicName)
            .ToList();
    }

    private static PrefeituraAbsenceItem BuildAbsenceItem(
        ShiftAssignment assignment,
        Shift shift,
        string type,
        int? lateMinutes,
        bool justified,
        Substitution? relatedSub) => new()
        {
            // Chave estável: hash de (shiftId, userId, type). Facilita
            // reconciliação no frontend sem persistir a "ausência" como entity.
            Id = DeriveAbsenceId(shift.Id, assignment.UserId, type),
            Type = type,
            UserId = assignment.UserId,
            UserName = assignment.User?.Name ?? string.Empty,
            ClinicId = shift.ClinicId,
            ClinicName = shift.Clinic?.Name ?? string.Empty,
            Date = shift.Date,
            ShiftLabel = $"{shift.Title} ({shift.StartTime:hh\\:mm}–{shift.EndTime:hh\\:mm})",
            MinutesLate = lateMinutes,
            Justified = justified,
            SubstituteName = relatedSub?.SubstituteUser?.Name,
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

        // Shifts em andamento agora: começam entre início do dia e agora,
        // terminam depois do agora. Overnight simplificado — não considera
        // wrap 23:00→05:00 aqui (débito documentado; sprint futura otimiza).
        var todaysShifts = (await _shiftRepo.GetInPeriodWithDetailsAsync(startOfDay, endOfDay))
            .Where(s => scope.ClinicIds.Contains(s.ClinicId))
            .ToList();

        var clinics = (await _clinicRepo.GetByIdsAsync(scope.ClinicIds)).ToList();
        var byClinic = clinics.ToDictionary(c => c.Id, c => new PrefeituraRealtimeClinic
        {
            ClinicId = c.Id,
            Name = c.Name,
        });

        foreach (var s in todaysShifts)
        {
            if (!byClinic.TryGetValue(s.ClinicId, out var card)) continue;
            var shiftStart = ShiftStartUtc(s);
            var shiftEnd = shiftStart.Add(s.EndTime - s.StartTime);
            if (shiftEnd <= shiftStart) shiftEnd = shiftEnd.AddDays(1); // overnight

            var inWindow = now >= shiftStart && now < shiftEnd;
            if (!inWindow) continue;

            foreach (var assignment in s.ShiftAssignments)
            {
                card.ExpectedCount++;
                var attendance = s.Attendances.FirstOrDefault(a => a.UserId == assignment.UserId);
                if (attendance is { CheckOutTime: null })
                {
                    card.PresentCount++;
                }
                else if (attendance is null && ShiftAlreadyPastAbsenceThreshold(s, now, settings))
                {
                    card.AbsentCount++;
                    if (assignment.User is not null)
                    {
                        card.AbsentUserNames.Add(assignment.User.Name);
                    }
                }
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

        return response;
    }
}
