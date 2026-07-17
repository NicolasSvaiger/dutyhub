using FluentAssertions;
using Moq;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

public class BillingServiceTests
{
    private readonly Mock<IShiftRepository> _shiftRepo = new();
    private readonly Mock<IAttendanceRepository> _attendanceRepo = new();
    private readonly Mock<IContractRepository> _contractRepo = new();
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<ITenantService> _tenant = new();

    private BillingService CreateService() =>
        new(_shiftRepo.Object, _attendanceRepo.Object, _contractRepo.Object,
            _clinicRepo.Object, _userRepo.Object, _tenant.Object);

    // ── Fixtures ──────────────────────────────────────────────────────────────

    private const int Year = 2026;
    private const int Month = 5;
    private static DateTime MonthStart => new(Year, Month, 1, 0, 0, 0, DateTimeKind.Utc);

    private static readonly Guid AlphaClinicId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid BetaClinicId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid ContractId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid OrganId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid DoctorAId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid DoctorBId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static Clinic MakeClinic(Guid id, string name, Guid? contractId = null) => new()
    {
        Id = id,
        Name = name,
        IsActive = true,
        CreatedAt = DateTime.UtcNow,
        ContractId = contractId,
    };

    private static Contract MakeContract(Guid id, decimal monthlyValue, params Guid[] clinicIds) => new()
    {
        Id = id,
        ContractNumber = "CT-2026-0001",
        PublicOrganId = OrganId,
        PublicOrgan = new PublicOrgan
        {
            Id = OrganId,
            Name = "Prefeitura Teste",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        },
        MonthlyValue = monthlyValue,
        StartDate = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        EndDate = new DateTime(2027, 12, 31, 0, 0, 0, DateTimeKind.Utc),
        Status = ContractStatus.Active,
        CreatedAt = DateTime.UtcNow,
        Clinics = clinicIds.Select(cid => new Clinic { Id = cid, Name = $"Clinic {cid}", IsActive = true }).ToList(),
    };

    private static User MakeUser(Guid id, string name, string? crm = null) => new()
    {
        Id = id,
        Email = $"{name}@x.com",
        Name = name,
        RegistrationNumber = crm,
        IsActive = true,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    /// <summary>Cria um shift assignado a um médico, num dia dentro do mês.</summary>
    private static Shift MakeAssignedShift(Guid clinicId, Guid userId, int day)
    {
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId,
            ClinicId = clinicId,
            Title = "Plantão",
            Date = new DateTime(Year, Month, day, 0, 0, 0, DateTimeKind.Utc),
            StartTime = new TimeSpan(7, 0, 0),
            EndTime = new TimeSpan(19, 0, 0),
            CreatedAt = DateTime.UtcNow,
        };
        shift.ShiftAssignments = new List<ShiftAssignment>
        {
            new() { Id = Guid.NewGuid(), ShiftId = shiftId, UserId = userId, AssignedAt = DateTime.UtcNow },
        };
        return shift;
    }

    private static Attendance MakeAttendance(Guid clinicId, Guid userId, Shift shift, int hoursWorked = 12)
    {
        var checkIn = shift.Date.Add(shift.StartTime);
        return new Attendance
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ShiftId = shift.Id,
            ClinicId = clinicId,
            CheckInTime = checkIn,
            CheckOutTime = checkIn.AddHours(hoursWorked),
            CheckInDeviceId = "d",
            BiometricValidated = true,
        };
    }

    private void SetupRepos(
        IEnumerable<Clinic> clinics,
        IEnumerable<Contract> contracts,
        IEnumerable<User> users,
        IEnumerable<Shift> shifts,
        Dictionary<Guid, List<Attendance>> attendancesByClinic)
    {
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(clinics);
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(contracts);
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(users);
        _shiftRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(shifts);
        _attendanceRepo.Setup(r => r.GetByClinicAndDateRangeAsync(
                It.IsAny<Guid>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync((Guid clinicId, DateTime _, DateTime _) =>
                attendancesByClinic.GetValueOrDefault(clinicId, new List<Attendance>()));
    }

    // ── Basic validation ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetReportAsync_InvalidYear_Throws()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var act = () => CreateService().GetReportAsync(1500, 5);
        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task GetReportAsync_InvalidMonth_Throws()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var act = () => CreateService().GetReportAsync(2026, 13);
        await act.Should().ThrowAsync<BadRequestException>();
    }

    // ── Tenant scoping ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetReportAsync_AdminClinicaWithoutAuthorized_ReturnsEmpty()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Enumerable.Empty<Guid>());

        var result = await CreateService().GetReportAsync(Year, Month);

        result.Year.Should().Be(Year);
        result.Month.Should().Be(Month);
        result.TotalRevenue.Should().Be(0);
        result.Doctors.Should().BeEmpty();
        result.Contracts.Should().BeEmpty();
    }

    [Fact]
    public async Task GetReportAsync_AdminClinica_OnlyIncludesAuthorizedClinics()
    {
        // Alpha authorized, Beta not
        var clinics = new[]
        {
            MakeClinic(AlphaClinicId, "Alpha", ContractId),
            MakeClinic(BetaClinicId, "Beta", ContractId),
        };
        var contract = MakeContract(ContractId, 24000m, AlphaClinicId, BetaClinicId);
        var doctor = MakeUser(DoctorAId, "Dr. A");
        var shiftAlpha = MakeAssignedShift(AlphaClinicId, DoctorAId, 10);
        var shiftBeta = MakeAssignedShift(BetaClinicId, DoctorAId, 11);

        SetupRepos(clinics, new[] { contract }, new[] { doctor },
            new[] { shiftAlpha, shiftBeta },
            new Dictionary<Guid, List<Attendance>>());

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { AlphaClinicId });

        var result = await CreateService().GetReportAsync(Year, Month);

        result.TotalShiftsPlanned.Should().Be(1); // apenas alpha
        result.Doctors.Should().HaveCount(1);
        result.Doctors[0].ClinicId.Should().Be(AlphaClinicId);
    }

    // ── KPI calculations ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetReportAsync_ComputesTotalRevenueFromContracts()
    {
        var clinics = new[] { MakeClinic(AlphaClinicId, "Alpha", ContractId) };
        var contract = MakeContract(ContractId, 100_000m, AlphaClinicId);
        var doctor = MakeUser(DoctorAId, "Dr. A");
        var shift = MakeAssignedShift(AlphaClinicId, DoctorAId, 10);

        SetupRepos(clinics, new[] { contract }, new[] { doctor }, new[] { shift },
            new Dictionary<Guid, List<Attendance>>());
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.TotalRevenue.Should().Be(100_000m);
    }

    [Fact]
    public async Task GetReportAsync_100PercentFulfilled_NoDiscount()
    {
        var clinics = new[] { MakeClinic(AlphaClinicId, "Alpha", ContractId) };
        var contract = MakeContract(ContractId, 48_000m, AlphaClinicId);
        var doctor = MakeUser(DoctorAId, "Dr. A");
        var s1 = MakeAssignedShift(AlphaClinicId, DoctorAId, 5);
        var s2 = MakeAssignedShift(AlphaClinicId, DoctorAId, 12);

        var attendances = new Dictionary<Guid, List<Attendance>>
        {
            [AlphaClinicId] = new()
            {
                MakeAttendance(AlphaClinicId, DoctorAId, s1),
                MakeAttendance(AlphaClinicId, DoctorAId, s2),
            }
        };

        SetupRepos(clinics, new[] { contract }, new[] { doctor }, new[] { s1, s2 }, attendances);
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.TotalShiftsPlanned.Should().Be(2);
        result.TotalShiftsFulfilled.Should().Be(2);
        result.TotalDiscount.Should().Be(0m);
        result.NetPayable.Should().Be(48_000m);
        result.FulfillmentPercent.Should().Be(100m);
    }

    [Fact]
    public async Task GetReportAsync_PartialFulfillment_DiscountsMissedShifts()
    {
        // 2 shifts planejados a R$24.000/mês → pricePerShift = 12.000
        // 1 cumprido, 1 faltou → discount = 12.000
        var clinics = new[] { MakeClinic(AlphaClinicId, "Alpha", ContractId) };
        var contract = MakeContract(ContractId, 24_000m, AlphaClinicId);
        var doctor = MakeUser(DoctorAId, "Dr. A");
        var s1 = MakeAssignedShift(AlphaClinicId, DoctorAId, 5);
        var s2 = MakeAssignedShift(AlphaClinicId, DoctorAId, 12);

        var attendances = new Dictionary<Guid, List<Attendance>>
        {
            [AlphaClinicId] = new() { MakeAttendance(AlphaClinicId, DoctorAId, s1) }
        };

        SetupRepos(clinics, new[] { contract }, new[] { doctor }, new[] { s1, s2 }, attendances);
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.TotalShiftsPlanned.Should().Be(2);
        result.TotalShiftsFulfilled.Should().Be(1);
        result.TotalDiscount.Should().Be(12_000m);
        result.NetPayable.Should().Be(12_000m);
        result.FulfillmentPercent.Should().Be(50m);
    }

    [Fact]
    public async Task GetReportAsync_ComputesHoursWorked()
    {
        var clinics = new[] { MakeClinic(AlphaClinicId, "Alpha", ContractId) };
        var contract = MakeContract(ContractId, 12_000m, AlphaClinicId);
        var doctor = MakeUser(DoctorAId, "Dr. A");
        var s1 = MakeAssignedShift(AlphaClinicId, DoctorAId, 5);

        var attendances = new Dictionary<Guid, List<Attendance>>
        {
            [AlphaClinicId] = new() { MakeAttendance(AlphaClinicId, DoctorAId, s1, hoursWorked: 8) }
        };

        SetupRepos(clinics, new[] { contract }, new[] { doctor }, new[] { s1 }, attendances);
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.TotalHours.Should().Be(8m);
        result.Doctors[0].HoursWorked.Should().Be(8m);
    }

    // ── Per-contract summary ──────────────────────────────────────────────────

    [Fact]
    public async Task GetReportAsync_BuildsContractSummary()
    {
        var clinics = new[]
        {
            MakeClinic(AlphaClinicId, "Alpha", ContractId),
            MakeClinic(BetaClinicId, "Beta", ContractId),
        };
        var contract = MakeContract(ContractId, 100_000m, AlphaClinicId, BetaClinicId);
        var doctor = MakeUser(DoctorAId, "Dr. A");
        var s1 = MakeAssignedShift(AlphaClinicId, DoctorAId, 5);
        var s2 = MakeAssignedShift(BetaClinicId, DoctorAId, 12);

        var attendances = new Dictionary<Guid, List<Attendance>>
        {
            [AlphaClinicId] = new() { MakeAttendance(AlphaClinicId, DoctorAId, s1) },
            [BetaClinicId] = new(),
        };

        SetupRepos(clinics, new[] { contract }, new[] { doctor }, new[] { s1, s2 }, attendances);
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.Contracts.Should().HaveCount(1);
        var summary = result.Contracts[0];
        summary.ContractId.Should().Be(ContractId);
        summary.MonthlyValue.Should().Be(100_000m);
        summary.ClinicCount.Should().Be(2);
        summary.ShiftsPlanned.Should().Be(2);
        summary.ShiftsFulfilled.Should().Be(1);
        summary.FulfillmentPercent.Should().Be(50m);
        summary.Discount.Should().Be(50_000m); // pricePerShift = 50k, 1 missed
        summary.NetPayable.Should().Be(50_000m);
    }

    // ── Clinic hours ──────────────────────────────────────────────────────────

    [Fact]
    public async Task GetReportAsync_AggregatesHoursByClinic()
    {
        var clinics = new[]
        {
            MakeClinic(AlphaClinicId, "Alpha", ContractId),
            MakeClinic(BetaClinicId, "Beta", ContractId),
        };
        var contract = MakeContract(ContractId, 100_000m, AlphaClinicId, BetaClinicId);
        var doctor = MakeUser(DoctorAId, "Dr. A");
        var s1 = MakeAssignedShift(AlphaClinicId, DoctorAId, 5);
        var s2 = MakeAssignedShift(BetaClinicId, DoctorAId, 12);

        var attendances = new Dictionary<Guid, List<Attendance>>
        {
            [AlphaClinicId] = new() { MakeAttendance(AlphaClinicId, DoctorAId, s1, hoursWorked: 12) },
            [BetaClinicId] = new() { MakeAttendance(BetaClinicId, DoctorAId, s2, hoursWorked: 6) },
        };

        SetupRepos(clinics, new[] { contract }, new[] { doctor }, new[] { s1, s2 }, attendances);
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.ClinicHours.Should().HaveCount(2);
        // sorted desc by hours
        result.ClinicHours[0].ClinicId.Should().Be(AlphaClinicId);
        result.ClinicHours[0].Hours.Should().Be(12m);
        result.ClinicHours[1].ClinicId.Should().Be(BetaClinicId);
        result.ClinicHours[1].Hours.Should().Be(6m);
    }

    // ── Doctor rows ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetReportAsync_BuildsDoctorRows_OneRowPerDoctorPerClinic()
    {
        var clinics = new[]
        {
            MakeClinic(AlphaClinicId, "Alpha", ContractId),
            MakeClinic(BetaClinicId, "Beta", ContractId),
        };
        var contract = MakeContract(ContractId, 96_000m, AlphaClinicId, BetaClinicId);
        var docA = MakeUser(DoctorAId, "Dr. A", "CRM 1");
        var docB = MakeUser(DoctorBId, "Dr. B", "CRM 2");
        var s1 = MakeAssignedShift(AlphaClinicId, DoctorAId, 5);
        var s2 = MakeAssignedShift(BetaClinicId, DoctorBId, 12);

        SetupRepos(clinics, new[] { contract }, new[] { docA, docB }, new[] { s1, s2 },
            new Dictionary<Guid, List<Attendance>>());
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.Doctors.Should().HaveCount(2);
        result.Doctors[0].UserName.Should().Be("Dr. A");
        result.Doctors[0].ClinicName.Should().Be("Alpha");
        result.Doctors[0].RegistrationNumber.Should().Be("CRM 1");
        result.Doctors[1].UserName.Should().Be("Dr. B");
        result.Doctors[1].ClinicName.Should().Be("Beta");
    }

    [Fact]
    public async Task GetReportAsync_ExcludesShiftsOutsideMonth()
    {
        var clinics = new[] { MakeClinic(AlphaClinicId, "Alpha", ContractId) };
        var contract = MakeContract(ContractId, 24_000m, AlphaClinicId);
        var doctor = MakeUser(DoctorAId, "Dr. A");

        var shiftInMonth = MakeAssignedShift(AlphaClinicId, DoctorAId, 10);
        var shiftOutOfMonth = MakeAssignedShift(AlphaClinicId, DoctorAId, 10);
        shiftOutOfMonth.Date = new DateTime(Year, Month + 1, 10, 0, 0, 0, DateTimeKind.Utc);

        SetupRepos(clinics, new[] { contract }, new[] { doctor },
            new[] { shiftInMonth, shiftOutOfMonth },
            new Dictionary<Guid, List<Attendance>>());
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.TotalShiftsPlanned.Should().Be(1);
    }

    [Fact]
    public async Task GetReportAsync_ZeroPlanned_HasZeroFulfillment()
    {
        var clinics = new[] { MakeClinic(AlphaClinicId, "Alpha", ContractId) };
        var contract = MakeContract(ContractId, 24_000m, AlphaClinicId);
        var doctor = MakeUser(DoctorAId, "Dr. A");

        SetupRepos(clinics, new[] { contract }, new[] { doctor },
            Enumerable.Empty<Shift>(),
            new Dictionary<Guid, List<Attendance>>());
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.TotalShiftsPlanned.Should().Be(0);
        result.FulfillmentPercent.Should().Be(0m);
        result.Doctors.Should().BeEmpty();
    }

    [Fact]
    public async Task GetReportAsync_NoContractsButShiftsExist_StillReturnsRows()
    {
        // Cenário defensivo: shifts em clínica sem contrato — receita = 0, mas os shifts aparecem
        var clinics = new[] { MakeClinic(AlphaClinicId, "Alpha", contractId: null) };
        var doctor = MakeUser(DoctorAId, "Dr. A");
        var shift = MakeAssignedShift(AlphaClinicId, DoctorAId, 10);

        SetupRepos(clinics, Enumerable.Empty<Contract>(), new[] { doctor }, new[] { shift },
            new Dictionary<Guid, List<Attendance>>());
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);

        var result = await CreateService().GetReportAsync(Year, Month);

        result.TotalRevenue.Should().Be(0m);
        result.Contracts.Should().BeEmpty();
        result.Doctors.Should().HaveCount(1);
        result.Doctors[0].GrossAmount.Should().Be(0m);
    }
}
