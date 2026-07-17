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
/// Cobre ManagementReportService — o relatório gerencial mensal (Admin OS → Gerencial).
///  • Autorização: apenas AdminGlobal
///  • Cálculo do SLA global (fulfilled / scheduled)
///  • Ausências e atrasos derivados dos shifts do período
///  • SLA por contrato + status ok/warn/crit vs meta
///  • Ranking de UPAs (SLA por clínica)
///  • Top médicos com mais ocorrências
///  • Evolução 5 meses (chamadas ao repo para cada mês)
///  • Destaques (pontos para reunião)
/// </summary>
public class ManagementReportServiceTests
{
    private readonly Mock<IShiftRepository> _shiftRepo = new();
    private readonly Mock<IContractRepository> _contractRepo = new();
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<ISettingsRepository> _settingsRepo = new();
    private readonly Mock<ITenantService> _tenant = new();

    private ManagementReportService CreateService() => new(
        _shiftRepo.Object, _contractRepo.Object, _clinicRepo.Object,
        _userRepo.Object, _settingsRepo.Object, _tenant.Object);

    private static SystemSettings Settings(int tolerance = 15) => new()
    {
        Id = SystemSettings.SingletonId,
        CheckInToleranceMinutes = tolerance,
        AbsenceThresholdMinutes = 60,
    };

    private static User MakeMedico(Guid id, string name) => new()
    {
        Id = id, Name = name, Email = $"{id}@x", PasswordHash = "h",
        IsActive = true, ProfessionalType = ProfessionalType.Medico,
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
    };

    private static Clinic MakeClinic(Guid id, string name, Guid? contractId = null, Contract? contract = null) => new()
    {
        Id = id, Name = name, IsActive = true, ContractId = contractId, Contract = contract,
    };

    private static Contract MakeContract(Guid id, string number, string organ, int? minSla = 90, DateTime? end = null) => new()
    {
        Id = id, ContractNumber = number, Status = ContractStatus.Active,
        MinSlaPercent = minSla, StartDate = DateTime.UtcNow.AddYears(-1),
        EndDate = end ?? DateTime.UtcNow.AddYears(1), MonthlyValue = 100_000m,
        PublicOrgan = new PublicOrgan { Id = Guid.NewGuid(), Name = organ, Cnpj = "00000000000000" },
    };

    private static Shift MakeShift(
        Guid id, Clinic clinic, DateTime date, TimeSpan start,
        List<(Guid userId, string name)> assignments,
        List<(Guid userId, DateTime checkIn)> attendances)
    {
        var shift = new Shift
        {
            Id = id, ClinicId = clinic.Id, Clinic = clinic,
            Date = DateTime.SpecifyKind(date.Date, DateTimeKind.Utc),
            StartTime = start, EndTime = start.Add(TimeSpan.FromHours(12)),
            CreatedAt = DateTime.UtcNow,
        };
        shift.ShiftAssignments = assignments.Select(a => new ShiftAssignment
        {
            Id = Guid.NewGuid(), ShiftId = id, UserId = a.userId,
            AssignedAt = DateTime.UtcNow, User = MakeMedico(a.userId, a.name),
        }).ToList();
        shift.Attendances = attendances.Select(a => new Attendance
        {
            Id = Guid.NewGuid(), ShiftId = id, UserId = a.userId, ClinicId = clinic.Id,
            CheckInTime = a.checkIn, CheckInDeviceId = "d",
        }).ToList();
        return shift;
    }

    // ── Autorização ─────────────────────────────────────────────────────

    [Fact]
    public async Task GetReport_NonAdminGlobal_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        var act = () => CreateService().GetReportAsync(2026, 5);
        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task GetReport_InvalidMonth_ThrowsBadRequest()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());
        var act = () => CreateService().GetReportAsync(2026, 13);
        await act.Should().ThrowAsync<BadRequestException>();
    }

    // ── Base ────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetReport_EmptyPeriod_ReturnsZeroKpisAndFlatDirection()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());
        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift>());
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract>());

        var result = await CreateService().GetReportAsync(2026, 5);

        result.Year.Should().Be(2026);
        result.Month.Should().Be(5);
        result.PeriodLabel.Should().Be("Maio 2026");
        result.SlaGlobal.Value.Should().Be(0);
        result.SlaGlobal.Direction.Should().Be("flat");
        result.TotalAbsences.Value.Should().Be(0);
        result.TotalLateEvents.Value.Should().Be(0);
        result.Contracts.Should().BeEmpty();
        result.ClinicRanking.Should().BeEmpty();
        result.ProblemDoctors.Should().BeEmpty();
    }

    [Fact]
    public async Task GetReport_ComputesSlaFromShifts()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());

        var contract = MakeContract(Guid.NewGuid(), "CT-1", "Prefeitura SP", 90);
        var clinic = MakeClinic(Guid.NewGuid(), "UPA Alpha", contract.Id, contract);

        var u1 = Guid.NewGuid();
        var u2 = Guid.NewGuid();
        var u3 = Guid.NewGuid();

        // 3 assignments no shift, apenas 2 compareceram → SLA 66.7%
        var start = new TimeSpan(7, 0, 0);
        var shiftDate = new DateTime(2026, 5, 10);
        var shift = MakeShift(
            Guid.NewGuid(), clinic, shiftDate, start,
            assignments: new() { (u1, "Dr. A"), (u2, "Dra. B"), (u3, "Dr. C") },
            attendances: new() { (u1, shiftDate.Add(start)), (u2, shiftDate.Add(start)) });

        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift> { shift });
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract> { contract });

        var result = await CreateService().GetReportAsync(2026, 5);

        result.SlaGlobal.Value.Should().BeApproximately(66.7, 0.2);
        result.TotalAbsences.Value.Should().Be(1);
        result.TotalLateEvents.Value.Should().Be(0);
        result.Contracts.Should().ContainSingle();
        result.Contracts[0].SlaPercent.Should().BeApproximately(66.7, 0.2);
        result.Contracts[0].Status.Should().Be("crit"); // 66% << 90 - 5
    }

    [Fact]
    public async Task GetReport_DetectsLateCheckInsOutsideTolerance()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings(tolerance: 15));

        var clinic = MakeClinic(Guid.NewGuid(), "UPA Alpha");
        var u1 = Guid.NewGuid();
        var u2 = Guid.NewGuid();
        var start = new TimeSpan(7, 0, 0);
        var shiftDate = new DateTime(2026, 5, 10);

        // u1 chega em cima da hora (não é atraso), u2 chega 20 min depois (atraso)
        var shift = MakeShift(Guid.NewGuid(), clinic, shiftDate, start,
            assignments: new() { (u1, "Dr. A"), (u2, "Dr. B") },
            attendances: new() {
                (u1, shiftDate.Add(start)),
                (u2, shiftDate.Add(start).AddMinutes(20)),
            });

        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift> { shift });
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract>());

        var result = await CreateService().GetReportAsync(2026, 5);

        result.TotalLateEvents.Value.Should().Be(1);
        result.TotalAbsences.Value.Should().Be(0);
        result.SlaGlobal.Value.Should().Be(100); // ambos compareceram
    }

    [Fact]
    public async Task GetReport_ContractAboveTarget_MarkedAsOk()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());

        var contract = MakeContract(Guid.NewGuid(), "CT-1", "Prefeitura X", minSla: 85);
        var clinic = MakeClinic(Guid.NewGuid(), "UPA", contract.Id, contract);

        var u1 = Guid.NewGuid();
        var shift = MakeShift(Guid.NewGuid(), clinic, new DateTime(2026, 5, 10), new TimeSpan(7, 0, 0),
            assignments: new() { (u1, "Dr. A") },
            attendances: new() { (u1, new DateTime(2026, 5, 10, 7, 0, 0)) });

        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift> { shift });
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract> { contract });

        var result = await CreateService().GetReportAsync(2026, 5);

        result.Contracts[0].Status.Should().Be("ok");
        result.Contracts[0].TargetPercent.Should().Be(85);
        result.ContractsInSla.InSla.Should().Be(1);
        result.ContractsInSla.Total.Should().Be(1);
    }

    [Fact]
    public async Task GetReport_RanksClinicsBySlaDescending()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());

        var clinicA = MakeClinic(Guid.NewGuid(), "UPA A"); // 100%
        var clinicB = MakeClinic(Guid.NewGuid(), "UPA B"); // 50%
        var u = Guid.NewGuid();
        var day = new DateTime(2026, 5, 10);
        var start = new TimeSpan(7, 0, 0);

        var shiftA = MakeShift(Guid.NewGuid(), clinicA, day, start,
            assignments: new() { (u, "Dr. A") },
            attendances: new() { (u, day.Add(start)) });

        var u2 = Guid.NewGuid();
        var u3 = Guid.NewGuid();
        var shiftB = MakeShift(Guid.NewGuid(), clinicB, day, start,
            assignments: new() { (u2, "Dr. B"), (u3, "Dr. C") },
            attendances: new() { (u2, day.Add(start)) }); // metade compareceu

        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift> { shiftA, shiftB });
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract>());

        var result = await CreateService().GetReportAsync(2026, 5);

        result.ClinicRanking.Should().HaveCount(2);
        result.ClinicRanking[0].ClinicName.Should().Be("UPA A");
        result.ClinicRanking[0].Position.Should().Be(1);
        result.ClinicRanking[1].ClinicName.Should().Be("UPA B");
        result.ClinicRanking[1].Position.Should().Be(2);
    }

    [Fact]
    public async Task GetReport_ListsTopProblemDoctors()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());

        var clinic = MakeClinic(Guid.NewGuid(), "UPA");
        var problem = Guid.NewGuid(); // será ausente em 2 shifts
        var okDoc = Guid.NewGuid();
        var day1 = new DateTime(2026, 5, 5);
        var day2 = new DateTime(2026, 5, 12);
        var start = new TimeSpan(7, 0, 0);

        var s1 = MakeShift(Guid.NewGuid(), clinic, day1, start,
            assignments: new() { (problem, "Dr. Problema"), (okDoc, "Dr. OK") },
            attendances: new() { (okDoc, day1.Add(start)) });

        var s2 = MakeShift(Guid.NewGuid(), clinic, day2, start,
            assignments: new() { (problem, "Dr. Problema"), (okDoc, "Dr. OK") },
            attendances: new() { (okDoc, day2.Add(start)) });

        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift> { s1, s2 });
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract>());

        var result = await CreateService().GetReportAsync(2026, 5);

        result.ProblemDoctors.Should().ContainSingle();
        result.ProblemDoctors[0].UserName.Should().Be("Dr. Problema");
        result.ProblemDoctors[0].AbsenceCount.Should().Be(2);
        result.ProblemDoctors[0].OccurrenceCount.Should().Be(2);
        result.ProblemDoctors[0].Initials.Should().Be("DP");
    }

    [Fact]
    public async Task GetReport_TrendDirection_UpWhenSlaImproves()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());

        var clinic = MakeClinic(Guid.NewGuid(), "UPA");
        var u = Guid.NewGuid();
        var start = new TimeSpan(7, 0, 0);

        // Mês corrente: 100% (1 assign, 1 attendance)
        var current = MakeShift(Guid.NewGuid(), clinic, new DateTime(2026, 5, 10), start,
            assignments: new() { (u, "Dr. A") },
            attendances: new() { (u, new DateTime(2026, 5, 10, 7, 0, 0)) });

        // Mês anterior: 50% (2 assigns, 1 attendance)
        var u2 = Guid.NewGuid();
        var previous = MakeShift(Guid.NewGuid(), clinic, new DateTime(2026, 4, 10), start,
            assignments: new() { (u, "Dr. A"), (u2, "Dr. B") },
            attendances: new() { (u, new DateTime(2026, 4, 10, 7, 0, 0)) });

        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(
                It.Is<DateTime>(d => d.Month == 5), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift> { current });
        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(
                It.Is<DateTime>(d => d.Month == 4), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift> { previous });
        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(
                It.Is<DateTime>(d => d.Month != 5 && d.Month != 4), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift>());
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract>());

        var result = await CreateService().GetReportAsync(2026, 5);

        result.SlaGlobal.Direction.Should().Be("up");
        result.SlaGlobal.Label.Should().Contain("↑");
    }

    [Fact]
    public async Task GetReport_ExpiringContract_AppearsInHighlights()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());

        // Contrato vence em 30 dias
        var expiring = MakeContract(Guid.NewGuid(), "CT-EXP", "Prefeitura Y",
            minSla: 90, end: DateTime.UtcNow.Date.AddDays(30));

        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift>());
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract> { expiring });

        var result = await CreateService().GetReportAsync(DateTime.UtcNow.Year, DateTime.UtcNow.Month);

        result.Highlights.Should().Contain(h => h.Kind == "neu" && h.Text.Contains("vence"));
    }

    [Fact]
    public async Task GetReport_Evolution_Contains5Months()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());
        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift>());
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract>
        {
            MakeContract(Guid.NewGuid(), "CT-1", "Pref A"),
            MakeContract(Guid.NewGuid(), "CT-2", "Pref B"),
        });

        var result = await CreateService().GetReportAsync(2026, 5);

        result.Evolution.Months.Should().HaveCount(5);
        result.Evolution.Months.Last().Should().Be("Mai");
        result.Evolution.ContractSeries.Should().HaveCount(2);
        result.Evolution.ContractSeries[0].Values.Should().HaveCount(5);
        result.Evolution.AbsencesByMonth.Should().HaveCount(5);
    }

    [Fact]
    public async Task GetReport_UsesCurrentPeriodWhenNoYearMonthProvided()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());
        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift>());
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract>());

        var now = DateTime.UtcNow;
        var result = await CreateService().GetReportAsync();

        result.Year.Should().Be(now.Year);
        result.Month.Should().Be(now.Month);
    }

    [Fact]
    public async Task GetReport_TrendCards_HasAllExpectedKeys()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(Settings());

        var clinicA = MakeClinic(Guid.NewGuid(), "UPA A");
        var clinicB = MakeClinic(Guid.NewGuid(), "UPA B");
        var u = Guid.NewGuid();
        var start = new TimeSpan(7, 0, 0);
        var day = new DateTime(2026, 5, 10);

        var s1 = MakeShift(Guid.NewGuid(), clinicA, day, start,
            assignments: new() { (u, "Dr. A") },
            attendances: new() { (u, day.Add(start)) });
        var u2 = Guid.NewGuid();
        var s2 = MakeShift(Guid.NewGuid(), clinicB, day, start,
            assignments: new() { (u2, "Dr. B") },
            attendances: new());

        _shiftRepo.Setup(r => r.GetInPeriodWithDetailsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Shift> { s1, s2 });
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Contract>());

        var result = await CreateService().GetReportAsync(2026, 5);

        result.Trends.Should().Contain(t => t.Key == "sla-trend");
        result.Trends.Should().Contain(t => t.Key == "critical-doctors");
        result.Trends.Should().Contain(t => t.Key == "top-clinic");
        result.Trends.Should().Contain(t => t.Key == "alert-clinic");
    }
}
