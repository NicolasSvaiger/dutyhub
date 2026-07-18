using FluentAssertions;
using Moq;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Sprint 7B.1 — cobre <see cref="PrefeituraService"/> ponta a ponta.
/// Foco em (a) resolução de escopo (organ + descendentes → clinics via
/// contratos ativos), (b) agregações corretas de late/absence/coverage,
/// (c) filtros nos endpoints, (d) fail-safe quando escopo está vazio ou
/// gestor sem organ. Mocks de todos os 11 deps; usa fake do
/// <see cref="ICacheService"/> que sempre passa pela factory (cenário
/// "cache miss") pra deixar a lógica de agregação sob teste.
/// </summary>
public class PrefeituraServiceTests
{
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<IPublicOrganRepository> _organRepo = new();
    private readonly Mock<IContractRepository> _contractRepo = new();
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<IShiftRepository> _shiftRepo = new();
    private readonly Mock<IAttendanceRepository> _attendanceRepo = new();
    private readonly Mock<ISubstitutionRepository> _substitutionRepo = new();
    private readonly Mock<IJustificationRepository> _justificationRepo = new();
    private readonly Mock<IAlertRepository> _alertRepo = new();
    private readonly Mock<ISettingsRepository> _settingsRepo = new();
    private readonly Mock<IAlertService> _alertService = new();
    private readonly PassthroughCache _cache = new();

    private static readonly Guid OrganId = Guid.Parse("11111111-0000-0000-0000-000000000001");
    private static readonly Guid ClinicA = Guid.Parse("aaaa1111-0000-0000-0000-000000000001");
    private static readonly Guid ClinicB = Guid.Parse("aaaa1111-0000-0000-0000-000000000002");

    private PrefeituraService CreateService() => new(
        _tenant.Object, _cache, _organRepo.Object, _contractRepo.Object,
        _clinicRepo.Object, _shiftRepo.Object, _attendanceRepo.Object,
        _substitutionRepo.Object, _justificationRepo.Object,
        _alertRepo.Object, _settingsRepo.Object, _alertService.Object);

    private void SetupHealthyScope(params Guid[] clinicIds)
    {
        _tenant.Setup(t => t.GetCurrentPublicOrganId()).Returns(OrganId);
        _organRepo.Setup(r => r.GetDescendantIdsAsync(OrganId, It.IsAny<CancellationToken>()))
                  .ReturnsAsync(new[] { OrganId });
        _contractRepo.Setup(r => r.GetActiveClinicIdsByOrganIdsAsync(
                            It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()))
                     .ReturnsAsync(clinicIds);
        _settingsRepo.Setup(s => s.GetAsync()).ReturnsAsync(NewSettings());
    }

    private static SystemSettings NewSettings(int tolerance = 15, int absence = 60) => new()
    {
        Id = SystemSettings.SingletonId,
        CheckInToleranceMinutes = tolerance,
        AbsenceThresholdMinutes = absence,
    };

    private static Clinic NewClinic(Guid id, string name, string? contractNumber = null) => new()
    {
        Id = id,
        Name = name,
        IsActive = true,
        Contract = contractNumber is null ? null : new Contract
        {
            Id = Guid.NewGuid(),
            ContractNumber = contractNumber,
            Status = ContractStatus.Active,
        },
    };

    private static User NewUser(Guid id, string name) => new()
    {
        Id = id, Name = name, Email = $"{id}@x", PasswordHash = "h", IsActive = true,
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
    };

    /// <summary>
    /// Monta um Shift com Assignments + Attendances já ligados. shiftStart é
    /// UTC ancorado no dia informado + startTime. Attendances aceitam
    /// (userId, deltaMinutes) — delta relativo ao início do shift.
    /// </summary>
    private static Shift NewShift(
        Guid clinicId,
        string clinicName,
        DateTime date,
        TimeSpan startTime,
        List<(Guid userId, string name)> assignments,
        List<(Guid userId, int checkInDeltaMinutes)> attendances,
        int shiftHours = 12)
    {
        var shiftId = Guid.NewGuid();
        var shiftStartUtc = DateTime.SpecifyKind(date.Date.Add(startTime), DateTimeKind.Utc);
        var clinic = NewClinic(clinicId, clinicName);
        return new Shift
        {
            Id = shiftId,
            ClinicId = clinicId,
            Clinic = clinic,
            Title = "Plantão teste",
            Date = DateTime.SpecifyKind(date.Date, DateTimeKind.Utc),
            StartTime = startTime,
            EndTime = startTime.Add(TimeSpan.FromHours(shiftHours)),
            CreatedAt = DateTime.UtcNow,
            ShiftAssignments = assignments.Select(a => new ShiftAssignment
            {
                Id = Guid.NewGuid(),
                ShiftId = shiftId,
                UserId = a.userId,
                User = NewUser(a.userId, a.name),
                AssignedAt = DateTime.UtcNow,
            }).ToList(),
            Attendances = attendances.Select(a => new Attendance
            {
                Id = Guid.NewGuid(),
                ShiftId = shiftId,
                UserId = a.userId,
                ClinicId = clinicId,
                CheckInTime = shiftStartUtc.AddMinutes(a.checkInDeltaMinutes),
                CheckInDeviceId = "test-device",
            }).ToList(),
        };
    }

    // ─────────────────────────────────────────────────────────────
    // ResolveScope — testado indiretamente via GetDashboardAsync.
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_WhenNoOrganResolved_ThrowsForbidden()
    {
        _tenant.Setup(t => t.GetCurrentPublicOrganId()).Returns((Guid?)null);
        var act = () => CreateService().GetDashboardAsync();
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*NO_ORGAN_CONTEXT*");
    }

    [Fact]
    public async Task GetDashboard_WhenScopeHasNoClinics_ReturnsEmptyClinicCount()
    {
        SetupHealthyScope(/* nenhuma clinicId */);
        _alertRepo.Setup(a => a.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), It.IsAny<bool>()))
                  .ReturnsAsync(Array.Empty<Alert>());

        var response = await CreateService().GetDashboardAsync();

        response.ClinicCount.Should().Be(0);
        response.TodayExpectedShifts.Should().Be(0);
        response.TodayComplianceRate.Should().Be(0);
        response.RecentAlerts.Should().BeEmpty();
    }

    [Fact]
    public async Task ResolveScope_UsesDescendantsFromRepoAndFiltersByActiveContracts()
    {
        var descendantId = Guid.NewGuid();
        _tenant.Setup(t => t.GetCurrentPublicOrganId()).Returns(OrganId);
        _organRepo.Setup(r => r.GetDescendantIdsAsync(OrganId, It.IsAny<CancellationToken>()))
                  .ReturnsAsync(new[] { OrganId, descendantId });

        // Contract repo recebe os dois organs → retorna ClinicA (do descendente)
        var seen = new List<Guid>();
        _contractRepo.Setup(r => r.GetActiveClinicIdsByOrganIdsAsync(
                            It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()))
                     .Callback<IEnumerable<Guid>, CancellationToken>((ids, _) => seen.AddRange(ids))
                     .ReturnsAsync(new[] { ClinicA });
        _settingsRepo.Setup(s => s.GetAsync()).ReturnsAsync(NewSettings());
        _alertRepo.Setup(a => a.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), It.IsAny<bool>()))
                  .ReturnsAsync(Array.Empty<Alert>());

        var response = await CreateService().GetDashboardAsync();

        seen.Should().Contain(new[] { OrganId, descendantId });
        response.ClinicCount.Should().Be(1);
    }

    // ─────────────────────────────────────────────────────────────
    // Dashboard
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDashboard_HappyPath_ComputesComplianceRateAndAlerts()
    {
        SetupHealthyScope(ClinicA);
        var today = DateTime.UtcNow.Date;
        var userOnTime = Guid.NewGuid();
        var userLate = Guid.NewGuid();

        var shift = NewShift(ClinicA, "Alpha", today, new TimeSpan(7, 0, 0),
            assignments: new() { (userOnTime, "On-Time"), (userLate, "Late Dr.") },
            attendances: new() { (userOnTime, 5), (userLate, 60) }); // late = 60 min > 15 tol

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(
                        It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });

        _alertRepo.Setup(a => a.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), false))
                  .ReturnsAsync(new[] { new Alert
                  {
                      Id = Guid.NewGuid(), Code = "ALT-1", Title = "Sem cobertura",
                      Level = AlertLevel.Critical, IsResolved = false,
                      Clinic = NewClinic(ClinicA, "Alpha"), CreatedAt = DateTime.UtcNow,
                  }});

        var response = await CreateService().GetDashboardAsync();

        response.TodayExpectedShifts.Should().Be(2);
        response.TodayCoveredShifts.Should().Be(2);
        response.TodayComplianceRate.Should().Be(100);
        response.TodayLateEvents.Should().Be(1);
        response.RecentAlerts.Should().ContainSingle().Which.Level.Should().Be("critical");
    }

    [Fact]
    public async Task GetDashboard_ResolvedAlerts_AreExcluded()
    {
        SetupHealthyScope(ClinicA);
        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(Array.Empty<Shift>());

        var openAlert = new Alert
        {
            Id = Guid.NewGuid(), Code = "ALT-open", Title = "Aberto",
            Level = AlertLevel.Warning, IsResolved = false, CreatedAt = DateTime.UtcNow,
        };
        var resolvedAlert = new Alert
        {
            Id = Guid.NewGuid(), Code = "ALT-resolved", Title = "Resolvido",
            Level = AlertLevel.Critical, IsResolved = true, CreatedAt = DateTime.UtcNow,
        };
        _alertRepo.Setup(a => a.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), false))
                  .ReturnsAsync(new[] { openAlert, resolvedAlert });

        var response = await CreateService().GetDashboardAsync();

        response.RecentAlerts.Should().ContainSingle()
            .Which.Code.Should().Be("ALT-open");
    }

    // ─────────────────────────────────────────────────────────────
    // Kpis
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetKpis_HappyPath_AggregatesByClinicAndGlobal()
    {
        SetupHealthyScope(ClinicA, ClinicB);
        var day = DateTime.UtcNow.Date.AddDays(-1);
        var uAlphaCovered = Guid.NewGuid();
        var uBetaMissing = Guid.NewGuid();

        var shiftAlpha = NewShift(ClinicA, "Alpha", day, new TimeSpan(7, 0, 0),
            assignments: new() { (uAlphaCovered, "A1") },
            attendances: new() { (uAlphaCovered, 0) });
        var shiftBeta = NewShift(ClinicB, "Beta", day, new TimeSpan(7, 0, 0),
            assignments: new() { (uBetaMissing, "B1") },
            attendances: new() { });

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shiftAlpha, shiftBeta });
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(Array.Empty<Substitution>());

        var from = day.AddDays(-2);
        var to = day.AddDays(1);
        var response = await CreateService().GetKpisAsync(from, to);

        response.TotalExpectedShifts.Should().Be(2);
        response.TotalCoveredShifts.Should().Be(1);
        response.TotalAbsences.Should().Be(1); // beta > threshold e sem attendance
        response.GlobalComplianceRate.Should().Be(50);
        response.ByClinic.Should().HaveCount(2);
        response.ByClinic.Single(c => c.ClinicId == ClinicA).ComplianceRate.Should().Be(100);
        response.ByClinic.Single(c => c.ClinicId == ClinicB).ComplianceRate.Should().Be(0);
    }

    [Fact]
    public async Task GetKpis_ComputesAverageLateMinutesAndSubstitutionRate()
    {
        SetupHealthyScope(ClinicA);
        var day = DateTime.UtcNow.Date.AddDays(-1);
        var u1 = Guid.NewGuid();
        var u2 = Guid.NewGuid();

        var shift = NewShift(ClinicA, "Alpha", day, new TimeSpan(7, 0, 0),
            assignments: new() { (u1, "u1"), (u2, "u2") },
            attendances: new() { (u1, 30), (u2, 45) }); // late = 15 e 30 min acima da tolerância 15

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(new[] { new Substitution
                         {
                             Id = Guid.NewGuid(), ClinicId = ClinicA,
                             ShiftDate = day, Status = SubstitutionStatus.Confirmed,
                             AbsentUser = NewUser(u1, "u1"), CreatedAt = day,
                         }});

        var response = await CreateService().GetKpisAsync(day.AddDays(-1), day.AddDays(1));

        response.TotalLateEvents.Should().Be(2);
        response.AverageLateMinutes.Should().BeGreaterThan(0);
        response.SubstitutionRate.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task GetKpis_EmptyClinics_ReturnsAllZero()
    {
        SetupHealthyScope();
        var response = await CreateService().GetKpisAsync(
            DateTime.UtcNow.Date.AddDays(-7), DateTime.UtcNow.Date);

        response.TotalExpectedShifts.Should().Be(0);
        response.GlobalComplianceRate.Should().Be(0);
        response.ByClinic.Should().BeEmpty();
    }

    // ─────────────────────────────────────────────────────────────
    // Clinics
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetClinics_ReturnsItemsOrderedByName()
    {
        SetupHealthyScope(ClinicA, ClinicB);
        _clinicRepo.Setup(c => c.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                   .ReturnsAsync(new[]
                   {
                       NewClinic(ClinicB, "Zeta UPA", "CT-002"),
                       NewClinic(ClinicA, "Alpha UPA", "CT-001"),
                   });

        var response = await CreateService().GetClinicsAsync();

        response.Should().HaveCount(2);
        response[0].Name.Should().Be("Alpha UPA");
        response[0].ContractNumber.Should().Be("CT-001");
        response[1].Name.Should().Be("Zeta UPA");
    }

    [Fact]
    public async Task GetClinics_EmptyScope_ReturnsEmptyList()
    {
        SetupHealthyScope();
        var response = await CreateService().GetClinicsAsync();
        response.Should().BeEmpty();
    }

    // ─────────────────────────────────────────────────────────────
    // Shifts
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetShifts_ReturnsItemsWithAssignmentsAndCheckedInFlag()
    {
        SetupHealthyScope(ClinicA);
        var day = DateTime.UtcNow.Date;
        var u1 = Guid.NewGuid();
        var u2 = Guid.NewGuid();

        var shift = NewShift(ClinicA, "Alpha", day, new TimeSpan(7, 0, 0),
            assignments: new() { (u1, "Attended"), (u2, "Absent") },
            attendances: new() { (u1, 0) });

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });

        var response = await CreateService().GetShiftsAsync(day.AddDays(-1), day.AddDays(1));

        response.Should().ContainSingle();
        var item = response[0];
        item.Assignments.Should().HaveCount(2);
        item.CheckedInCount.Should().Be(1);
        item.Assignments.Single(a => a.UserId == u1).HasCheckedIn.Should().BeTrue();
        item.Assignments.Single(a => a.UserId == u2).HasCheckedIn.Should().BeFalse();
    }

    [Fact]
    public async Task GetShifts_ClinicFilterOutsideScope_ReturnsEmpty()
    {
        SetupHealthyScope(ClinicA);
        var stranger = Guid.NewGuid();

        var response = await CreateService().GetShiftsAsync(
            DateTime.UtcNow.Date.AddDays(-7), DateTime.UtcNow.Date, clinicId: stranger);

        response.Should().BeEmpty();
        // Não faz nem query — bloqueio precoce protege dados fora do escopo.
        _shiftRepo.Verify(s => s.GetInPeriodWithDetailsAsync(
            It.IsAny<DateTime>(), It.IsAny<DateTime>()), Times.Never);
    }

    [Fact]
    public async Task GetShifts_ClinicFilterInsideScope_RestrictsToThatClinic()
    {
        SetupHealthyScope(ClinicA, ClinicB);
        var day = DateTime.UtcNow.Date;
        var shifts = new[]
        {
            NewShift(ClinicA, "Alpha", day, new TimeSpan(7, 0, 0),
                new() { (Guid.NewGuid(), "u1") }, new()),
            NewShift(ClinicB, "Beta", day, new TimeSpan(7, 0, 0),
                new() { (Guid.NewGuid(), "u2") }, new()),
        };
        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(shifts);

        var response = await CreateService().GetShiftsAsync(
            day.AddDays(-1), day.AddDays(1), clinicId: ClinicA);

        response.Should().ContainSingle();
        response[0].ClinicId.Should().Be(ClinicA);
    }

    // ─────────────────────────────────────────────────────────────
    // Frequency
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetFrequency_GroupsByClinicAndDate_ComputesPresenceRate()
    {
        SetupHealthyScope(ClinicA);
        var day = DateTime.UtcNow.Date.AddDays(-1);
        var u1 = Guid.NewGuid();
        var u2 = Guid.NewGuid();
        var u3 = Guid.NewGuid();
        var shift = NewShift(ClinicA, "Alpha", day, new TimeSpan(7, 0, 0),
            assignments: new() { (u1, "u1"), (u2, "u2"), (u3, "u3") },
            attendances: new() { (u1, 0), (u2, 0) }); // 2 de 3 → 66.7%

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });

        var response = await CreateService().GetFrequencyAsync(day.AddDays(-1), day.AddDays(1));

        response.Should().ContainSingle();
        var row = response[0];
        row.Expected.Should().Be(3);
        row.Actual.Should().Be(2);
        row.PresenceRate.Should().BeApproximately(66.7, 0.1);
    }

    [Fact]
    public async Task GetFrequency_ClinicOutsideScope_ReturnsEmpty()
    {
        SetupHealthyScope(ClinicA);
        var response = await CreateService().GetFrequencyAsync(
            DateTime.UtcNow.Date.AddDays(-7), DateTime.UtcNow.Date, clinicId: Guid.NewGuid());
        response.Should().BeEmpty();
    }

    // ─────────────────────────────────────────────────────────────
    // Absences
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAbsences_ClassifiesLateVsAbsence()
    {
        SetupHealthyScope(ClinicA);
        var day = DateTime.UtcNow.Date.AddDays(-1);
        var uLate = Guid.NewGuid();
        var uAbsent = Guid.NewGuid();
        var shift = NewShift(ClinicA, "Alpha", day, new TimeSpan(7, 0, 0),
            assignments: new() { (uLate, "Late Dr."), (uAbsent, "Absent Dr.") },
            attendances: new() { (uLate, 45) }); // 45 min > tolerância 15

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(Array.Empty<Substitution>());
        _justificationRepo.Setup(j => j.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                          .ReturnsAsync(Array.Empty<Justification>());

        var response = await CreateService().GetAbsencesAsync(day.AddDays(-1), day.AddDays(1));

        response.Should().HaveCount(2);
        response.Should().ContainSingle(i => i.Type == "late" && i.UserId == uLate);
        response.Single(i => i.Type == "late").MinutesLate.Should().BeGreaterThan(0);
        response.Should().ContainSingle(i => i.Type == "absence" && i.UserId == uAbsent);
    }

    [Fact]
    public async Task GetAbsences_TypeFilter_OnlyMatching()
    {
        SetupHealthyScope(ClinicA);
        var day = DateTime.UtcNow.Date.AddDays(-1);
        var uLate = Guid.NewGuid();
        var uAbsent = Guid.NewGuid();
        var shift = NewShift(ClinicA, "Alpha", day, new TimeSpan(7, 0, 0),
            assignments: new() { (uLate, "L"), (uAbsent, "A") },
            attendances: new() { (uLate, 60) });

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(Array.Empty<Substitution>());
        _justificationRepo.Setup(j => j.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                          .ReturnsAsync(Array.Empty<Justification>());

        var lateOnly = await CreateService().GetAbsencesAsync(day.AddDays(-1), day.AddDays(1), "late");
        lateOnly.Should().OnlyContain(i => i.Type == "late");

        var absenceOnly = await CreateService().GetAbsencesAsync(day.AddDays(-1), day.AddDays(1), "absence");
        absenceOnly.Should().OnlyContain(i => i.Type == "absence");
    }

    [Fact]
    public async Task GetAbsences_ApprovedJustification_MarksItemAsJustified()
    {
        SetupHealthyScope(ClinicA);
        var day = DateTime.UtcNow.Date.AddDays(-1);
        var uAbsent = Guid.NewGuid();
        var shift = NewShift(ClinicA, "Alpha", day, new TimeSpan(7, 0, 0),
            assignments: new() { (uAbsent, "Absent") }, attendances: new());

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(Array.Empty<Substitution>());
        _justificationRepo.Setup(j => j.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                          .ReturnsAsync(new[] { new Justification
                          {
                              Id = Guid.NewGuid(), ClinicId = ClinicA,
                              ShiftDate = shift.Date, AbsentUserId = uAbsent,
                              Status = JustificationStatus.Approved,
                              CreatedAt = day, ProtocolNumber = "P-1",
                              RequestText = "..",
                          }});

        var response = await CreateService().GetAbsencesAsync(day.AddDays(-1), day.AddDays(1));

        response.Should().ContainSingle();
        response[0].Justified.Should().BeTrue();
    }

    [Fact]
    public async Task GetAbsences_SubstitutionCovered_ExposesSubstituteName()
    {
        SetupHealthyScope(ClinicA);
        var day = DateTime.UtcNow.Date.AddDays(-1);
        var uAbsent = Guid.NewGuid();
        var uSub = Guid.NewGuid();
        var shift = NewShift(ClinicA, "Alpha", day, new TimeSpan(7, 0, 0),
            assignments: new() { (uAbsent, "Absent") }, attendances: new());

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(new[] { new Substitution
                         {
                             Id = Guid.NewGuid(), ClinicId = ClinicA,
                             ShiftDate = shift.Date, AbsentUserId = uAbsent,
                             SubstituteUserId = uSub,
                             SubstituteUser = NewUser(uSub, "Sub Doctor"),
                             Status = SubstitutionStatus.Confirmed,
                             CreatedAt = day,
                         }});
        _justificationRepo.Setup(j => j.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                          .ReturnsAsync(Array.Empty<Justification>());

        var response = await CreateService().GetAbsencesAsync(day.AddDays(-1), day.AddDays(1));

        response.Should().ContainSingle();
        response[0].SubstituteName.Should().Be("Sub Doctor");
    }

    // ─────────────────────────────────────────────────────────────
    // History
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetHistory_UnifiesEventsAcrossSources_OrderedDesc()
    {
        SetupHealthyScope(ClinicA);
        var now = DateTime.UtcNow;
        var uCheckin = Guid.NewGuid();

        _attendanceRepo.Setup(a => a.GetByClinicAndDateRangeAsync(
                            It.IsAny<Guid>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                       .ReturnsAsync(new[] { new Attendance
                       {
                           Id = Guid.NewGuid(), ClinicId = ClinicA, UserId = uCheckin,
                           User = NewUser(uCheckin, "Dr. Check"), Clinic = NewClinic(ClinicA, "Alpha"),
                           CheckInTime = now.AddHours(-1), CheckInDeviceId = "d",
                       }});
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(new[] { new Substitution
                         {
                             Id = Guid.NewGuid(), ClinicId = ClinicA, ShiftDate = now.Date,
                             AbsentUser = NewUser(Guid.NewGuid(), "A"),
                             Status = SubstitutionStatus.Pending, CreatedAt = now.AddHours(-3),
                         }});
        _justificationRepo.Setup(j => j.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                          .ReturnsAsync(new[] { new Justification
                          {
                              Id = Guid.NewGuid(), ClinicId = ClinicA, ShiftDate = now.Date,
                              AbsentUserId = Guid.NewGuid(), Status = JustificationStatus.Pending,
                              ProtocolNumber = "P-1", RequestText = "..", CreatedAt = now.AddHours(-2),
                          }});
        _alertRepo.Setup(a => a.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), false))
                  .ReturnsAsync(new[] { new Alert
                  {
                      Id = Guid.NewGuid(), Code = "ALT-1", Title = "Alerta",
                      Level = AlertLevel.Warning, CreatedAt = now.AddHours(-4),
                  }});

        var response = await CreateService().GetHistoryAsync(now.AddDays(-1), now.AddDays(1));

        response.Items.Should().HaveCount(4);
        // Ordem descendente: -1h (checkin) primeiro, -4h (alert) por último.
        response.Items[0].Type.Should().Be("checkin");
        response.Items[^1].Type.Should().Be("alert");
        response.TotalCount.Should().Be(4);
    }

    [Fact]
    public async Task GetHistory_TypeFilter_LimitsToRequestedSource()
    {
        SetupHealthyScope(ClinicA);
        var now = DateTime.UtcNow;

        _attendanceRepo.Setup(a => a.GetByClinicAndDateRangeAsync(
                            It.IsAny<Guid>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                       .ReturnsAsync(new[] { new Attendance
                       {
                           Id = Guid.NewGuid(), ClinicId = ClinicA, UserId = Guid.NewGuid(),
                           CheckInTime = now.AddHours(-1), CheckInDeviceId = "d",
                       }});
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(Array.Empty<Substitution>());
        _justificationRepo.Setup(j => j.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                          .ReturnsAsync(Array.Empty<Justification>());
        _alertRepo.Setup(a => a.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), false))
                  .ReturnsAsync(Array.Empty<Alert>());

        var response = await CreateService().GetHistoryAsync(now.AddDays(-1), now.AddDays(1), type: "checkin");

        response.Items.Should().OnlyContain(i => i.Type == "checkin");
    }

    [Fact]
    public async Task GetHistory_PaginatesResults()
    {
        SetupHealthyScope(ClinicA);
        var now = DateTime.UtcNow;
        var attendances = Enumerable.Range(1, 45).Select(i => new Attendance
        {
            Id = Guid.NewGuid(), ClinicId = ClinicA, UserId = Guid.NewGuid(),
            User = NewUser(Guid.NewGuid(), $"Dr {i}"),
            CheckInTime = now.AddMinutes(-i), CheckInDeviceId = "d",
        }).ToList();
        _attendanceRepo.Setup(a => a.GetByClinicAndDateRangeAsync(
                            It.IsAny<Guid>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                       .ReturnsAsync(attendances);
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(Array.Empty<Substitution>());
        _justificationRepo.Setup(j => j.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                          .ReturnsAsync(Array.Empty<Justification>());
        _alertRepo.Setup(a => a.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), false))
                  .ReturnsAsync(Array.Empty<Alert>());

        var page1 = await CreateService().GetHistoryAsync(
            now.AddDays(-1), now.AddDays(1), page: 1, pageSize: 20);
        var page2 = await CreateService().GetHistoryAsync(
            now.AddDays(-1), now.AddDays(1), page: 2, pageSize: 20);

        page1.Items.Should().HaveCount(20);
        page2.Items.Should().HaveCount(20);
        page1.TotalCount.Should().Be(45);
        page1.TotalPages.Should().Be(3);
    }

    [Fact]
    public async Task GetHistory_SearchFilter_MatchesTitleOrUserName()
    {
        SetupHealthyScope(ClinicA);
        var now = DateTime.UtcNow;
        _attendanceRepo.Setup(a => a.GetByClinicAndDateRangeAsync(
                            It.IsAny<Guid>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                       .ReturnsAsync(new[]
                       {
                           new Attendance { Id = Guid.NewGuid(), ClinicId = ClinicA,
                               UserId = Guid.NewGuid(), User = NewUser(Guid.NewGuid(), "Ana Silva"),
                               CheckInTime = now.AddHours(-1), CheckInDeviceId = "d" },
                           new Attendance { Id = Guid.NewGuid(), ClinicId = ClinicA,
                               UserId = Guid.NewGuid(), User = NewUser(Guid.NewGuid(), "Bruno Costa"),
                               CheckInTime = now.AddHours(-2), CheckInDeviceId = "d" },
                       });
        _substitutionRepo.Setup(s => s.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                         .ReturnsAsync(Array.Empty<Substitution>());
        _justificationRepo.Setup(j => j.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                          .ReturnsAsync(Array.Empty<Justification>());
        _alertRepo.Setup(a => a.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>(), false))
                  .ReturnsAsync(Array.Empty<Alert>());

        var response = await CreateService().GetHistoryAsync(
            now.AddDays(-1), now.AddDays(1), search: "ana");

        response.Items.Should().ContainSingle()
            .Which.UserName.Should().Be("Ana Silva");
    }

    // ─────────────────────────────────────────────────────────────
    // Realtime
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetRealtime_ComputesGreenWhenAllPresent()
    {
        SetupHealthyScope(ClinicA);
        var now = DateTime.UtcNow;
        var shiftStartUtc = now.AddMinutes(-30); // shift em andamento
        var u1 = Guid.NewGuid();

        var shift = NewShift(ClinicA, "Alpha",
            shiftStartUtc.Date, shiftStartUtc.TimeOfDay,
            assignments: new() { (u1, "u1") },
            attendances: new() { (u1, 0) });

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });
        _clinicRepo.Setup(c => c.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                   .ReturnsAsync(new[] { NewClinic(ClinicA, "Alpha") });

        var response = await CreateService().GetRealtimeAsync();

        response.Clinics.Should().ContainSingle();
        response.Clinics[0].AlertLevel.Should().Be("green");
        response.TotalPresentNow.Should().Be(1);
        response.TotalAbsentNow.Should().Be(0);
    }

    [Fact]
    public async Task GetRealtime_ComputesRedWhenAnyoneAbsent()
    {
        SetupHealthyScope(ClinicA);
        var now = DateTime.UtcNow;
        // Início do shift há 90 min → passou threshold de ausência (60min)
        var shiftStartUtc = now.AddMinutes(-90);
        var uPresent = Guid.NewGuid();
        var uAbsent = Guid.NewGuid();

        var shift = NewShift(ClinicA, "Alpha",
            shiftStartUtc.Date, shiftStartUtc.TimeOfDay,
            assignments: new() { (uPresent, "P"), (uAbsent, "A") },
            attendances: new() { (uPresent, 5) });

        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(new[] { shift });
        _clinicRepo.Setup(c => c.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                   .ReturnsAsync(new[] { NewClinic(ClinicA, "Alpha") });

        var response = await CreateService().GetRealtimeAsync();

        response.Clinics[0].AlertLevel.Should().Be("red");
        response.Clinics[0].AbsentUserNames.Should().Contain("A");
        response.TotalAbsentNow.Should().Be(1);
    }

    [Fact]
    public async Task GetRealtime_ClinicWithoutShifts_HasGreenAndZeroExpected()
    {
        SetupHealthyScope(ClinicA);
        _shiftRepo.Setup(s => s.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                  .ReturnsAsync(Array.Empty<Shift>());
        _clinicRepo.Setup(c => c.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>()))
                   .ReturnsAsync(new[] { NewClinic(ClinicA, "Alpha") });

        var response = await CreateService().GetRealtimeAsync();

        response.Clinics.Should().ContainSingle();
        response.Clinics[0].ExpectedCount.Should().Be(0);
        response.Clinics[0].AlertLevel.Should().Be("green");
    }

    [Fact]
    public async Task GetRealtime_EmptyScope_ReturnsEmptyResponse()
    {
        SetupHealthyScope();
        var response = await CreateService().GetRealtimeAsync();

        response.Clinics.Should().BeEmpty();
        response.TotalClinics.Should().Be(0);
    }

    // ─────────────────────────────────────────────────────────────
    // Sprint 7B.2 — NotifyOsAboutAbsenceAsync (Acionar OS)
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task NotifyOs_HappyPath_DelegatesToAlertServiceAndReturnsAlertId()
    {
        SetupHealthyScope(ClinicA);
        var shiftId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var expectedAlertId = Guid.NewGuid();

        var shift = NewShift(ClinicA, "Alpha", DateTime.UtcNow.Date, new TimeSpan(7, 0, 0),
            assignments: new() { (userId, "Dr. Ausente") }, attendances: new());
        // Sobrescreve o Id do shift pra bater com o request.
        typeof(Shift).GetProperty("Id")!.SetValue(shift, shiftId);
        _shiftRepo.Setup(s => s.GetByIdAsync(shiftId)).ReturnsAsync(shift);

        _alertService.Setup(a => a.CreateAsync(It.IsAny<PlantonHub.Application.DTOs.Alerts.CreateAlertRequest>()))
                     .ReturnsAsync(new PlantonHub.Application.DTOs.Alerts.AlertResponse { Id = expectedAlertId });

        var actual = await CreateService().NotifyOsAboutAbsenceAsync(shiftId, userId, "sem justificativa");

        actual.Should().Be(expectedAlertId);
        _alertService.Verify(a => a.CreateAsync(It.Is<PlantonHub.Application.DTOs.Alerts.CreateAlertRequest>(
            r => r.Level == AlertLevel.Critical &&
                 r.Type == AlertType.UnannouncedAbsence &&
                 r.ClinicId == ClinicA &&
                 r.RelatedUserId == userId &&
                 r.Title.Contains("Dr. Ausente") &&
                 r.Description.Contains("sem justificativa"))), Times.Once);
    }

    [Fact]
    public async Task NotifyOs_ShiftNotFound_ThrowsNotFound()
    {
        SetupHealthyScope(ClinicA);
        var shiftId = Guid.NewGuid();
        _shiftRepo.Setup(s => s.GetByIdAsync(shiftId)).ReturnsAsync((Shift?)null);

        var act = () => CreateService().NotifyOsAboutAbsenceAsync(shiftId, Guid.NewGuid(), null);
        await act.Should().ThrowAsync<NotFoundException>();
        _alertService.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task NotifyOs_ShiftOutsideScope_ThrowsNotFound_WithoutLeakingExistence()
    {
        // Shift existe mas está em outra clínica não coberta pelo scope.
        SetupHealthyScope(ClinicA);
        var otherClinic = Guid.NewGuid();
        var shiftId = Guid.NewGuid();
        var shift = NewShift(otherClinic, "Outra", DateTime.UtcNow.Date, new TimeSpan(7, 0, 0),
            assignments: new() { (Guid.NewGuid(), "X") }, attendances: new());
        typeof(Shift).GetProperty("Id")!.SetValue(shift, shiftId);
        _shiftRepo.Setup(s => s.GetByIdAsync(shiftId)).ReturnsAsync(shift);

        var act = () => CreateService().NotifyOsAboutAbsenceAsync(shiftId, Guid.NewGuid(), null);

        // NotFoundException (não Forbidden) para não vazar existência.
        await act.Should().ThrowAsync<NotFoundException>();
        _alertService.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task NotifyOs_UserNotAssignedToShift_ThrowsNotFound()
    {
        SetupHealthyScope(ClinicA);
        var shiftId = Guid.NewGuid();
        var assignedUser = Guid.NewGuid();
        var strangerUser = Guid.NewGuid();
        var shift = NewShift(ClinicA, "Alpha", DateTime.UtcNow.Date, new TimeSpan(7, 0, 0),
            assignments: new() { (assignedUser, "Assigned") }, attendances: new());
        typeof(Shift).GetProperty("Id")!.SetValue(shift, shiftId);
        _shiftRepo.Setup(s => s.GetByIdAsync(shiftId)).ReturnsAsync(shift);

        var act = () => CreateService().NotifyOsAboutAbsenceAsync(shiftId, strangerUser, null);

        await act.Should().ThrowAsync<NotFoundException>();
        _alertService.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task NotifyOs_MessageOmitted_OnlyDescribesShiftAndUser()
    {
        SetupHealthyScope(ClinicA);
        var shiftId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var shift = NewShift(ClinicA, "Alpha", DateTime.UtcNow.Date, new TimeSpan(7, 0, 0),
            assignments: new() { (userId, "Dra. Silva") }, attendances: new());
        typeof(Shift).GetProperty("Id")!.SetValue(shift, shiftId);
        _shiftRepo.Setup(s => s.GetByIdAsync(shiftId)).ReturnsAsync(shift);

        _alertService.Setup(a => a.CreateAsync(It.IsAny<PlantonHub.Application.DTOs.Alerts.CreateAlertRequest>()))
                     .ReturnsAsync(new PlantonHub.Application.DTOs.Alerts.AlertResponse { Id = Guid.NewGuid() });

        await CreateService().NotifyOsAboutAbsenceAsync(shiftId, userId, message: null);

        // Description deve mencionar o profissional/shift mas NÃO ter "Observação do gestor:".
        _alertService.Verify(a => a.CreateAsync(It.Is<PlantonHub.Application.DTOs.Alerts.CreateAlertRequest>(
            r => r.Description.Contains("Dra. Silva") &&
                 !r.Description.Contains("Observação do gestor"))), Times.Once);
    }
}

/// <summary>
/// Cache fake que sempre invoca a factory — deixa a lógica de agregação
/// sob teste sem depender de Redis nem de instrumentar semântica de cache.
/// </summary>
internal sealed class PassthroughCache : ICacheService
{
    public async Task<T?> GetOrSetAsync<T>(string key, Func<Task<T>> factory, TimeSpan? ttl = null, CancellationToken ct = default)
        => await factory();

    public Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
        => Task.FromResult<T?>(default);

    public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
        => Task.CompletedTask;

    public Task RemoveAsync(string key, CancellationToken ct = default)
        => Task.CompletedTask;

    public Task RemoveByPrefixAsync(string prefix, CancellationToken ct = default)
        => Task.CompletedTask;
}
