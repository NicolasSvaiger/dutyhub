using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Cobre GetLiveStatusAsync — o painel "Tempo Real" do Admin OS.
/// Cruza Shift + ShiftAssignment + Attendance + tolerâncias de SystemSettings
/// para calcular presente/atrasado/ausente/escalado por profissional, e agrega
/// isso em estatísticas por UPA.
/// </summary>
public class AttendanceLiveStatusTests
{
    private readonly Mock<IAttendanceRepository> _attRepo = new();
    private readonly Mock<IShiftRepository> _shiftRepo = new();
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<IFaceEnrollmentRepository> _faceRepo = new();
    private readonly Mock<ISettingsRepository> _settingsRepo = new();

    private AttendanceService CreateService() =>
        new(_attRepo.Object, _shiftRepo.Object, _clinicRepo.Object, _tenant.Object,
            _faceRepo.Object, new Mock<IBiometricProofService>().Object, _settingsRepo.Object);

    private static SystemSettings DefaultSettings(int toleranceMin = 15, int absenceThresholdMin = 60) => new()
    {
        Id = SystemSettings.SingletonId,
        CheckInToleranceMinutes = toleranceMin,
        AbsenceThresholdMinutes = absenceThresholdMin,
    };

    private static Clinic MakeClinic(Guid id, string name = "UPA Teste", int? toleranceOverride = null) => new()
    {
        Id = id,
        Name = name,
        Address = "Rua X",
        Phone = "119999",
        IsActive = true,
        CreatedAt = DateTime.UtcNow,
        CheckInToleranceMinutes = toleranceOverride,
        ShiftTemplates = new List<ClinicShiftTemplate>(),
    };

    private static Shift MakeShift(Guid clinicId, DateTime date, TimeSpan start, TimeSpan end, List<ShiftAssignment> assignments) => new()
    {
        Id = Guid.NewGuid(),
        ClinicId = clinicId,
        Title = "Plantão",
        Date = date,
        StartTime = start,
        EndTime = end,
        CreatedAt = DateTime.UtcNow,
        ShiftAssignments = assignments,
    };

    private static ShiftAssignment MakeAssignment(Guid shiftId, Guid userId, string userName) => new()
    {
        Id = Guid.NewGuid(),
        ShiftId = shiftId,
        UserId = userId,
        AssignedAt = DateTime.UtcNow,
        User = new User { Id = userId, Name = userName, Email = $"{userId}@x.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
    };

    private static Attendance MakeAttendance(Guid userId, Guid shiftId, Guid clinicId, DateTime checkInUtc) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        ShiftId = shiftId,
        ClinicId = clinicId,
        CheckInTime = checkInUtc,
        CheckInLatitude = -23.5,
        CheckInLongitude = -46.6,
        CheckInDeviceId = "dev",
        BiometricValidated = true,
    };

    private void SetupNoop(Guid clinicId)
    {
        _attRepo.Setup(r => r.GetByClinicAndDateRangeAsync(clinicId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(Enumerable.Empty<Attendance>());
    }

    // ─── Escopo por perfil ──────────────────────────────────────────────────

    [Fact]
    public async Task GetLiveStatusAsync_AdminClinica_NoAuthorizedClinics_ReturnsEmpty()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Enumerable.Empty<Guid>());

        var result = await CreateService().GetLiveStatusAsync();

        result.Clinics.Should().BeEmpty();
        _clinicRepo.Verify(r => r.GetAllAsync(), Times.Never);
    }

    [Fact]
    public async Task GetLiveStatusAsync_AdminGlobal_ScansAllClinicsRegardlessOfAuthorizedList()
    {
        var clinicId = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { MakeClinic(clinicId) });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(Enumerable.Empty<Shift>());
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        SetupNoop(clinicId);

        var result = await CreateService().GetLiveStatusAsync();

        result.Clinics.Should().ContainSingle(c => c.ClinicId == clinicId);
        // AdminGlobal path never calls GetAuthorizedClinicIds for scoping
        _tenant.Verify(t => t.GetAuthorizedClinicIds(), Times.Never);
    }

    [Fact]
    public async Task GetLiveStatusAsync_AdminClinica_OnlyScansAuthorizedClinics()
    {
        var myClinic = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { myClinic });
        _clinicRepo.Setup(r => r.GetByIdAsync(myClinic)).ReturnsAsync(MakeClinic(myClinic));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(myClinic)).ReturnsAsync(Enumerable.Empty<Shift>());
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        SetupNoop(myClinic);

        var result = await CreateService().GetLiveStatusAsync();

        result.Clinics.Should().ContainSingle(c => c.ClinicId == myClinic);
        _clinicRepo.Verify(r => r.GetAllAsync(), Times.Never);
    }

    // ─── Cálculo de status por profissional ────────────────────────────────

    [Fact]
    public async Task GetLiveStatusAsync_ProfessionalWithCheckIn_IsPresente()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var shiftStart = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(30)); // começou há 30 min
        var shift = MakeShift(clinicId, now.Date, shiftStart, shiftStart.Add(TimeSpan.FromHours(12)),
            new List<ShiftAssignment> { MakeAssignment(Guid.Empty, userId, "Dr. Teste") });
        // corrige ShiftId nas assignments (Shift.Id só existe após MakeShift)
        shift.ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shift.Id, userId, "Dr. Teste") };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _attRepo.Setup(r => r.GetByClinicAndDateRangeAsync(clinicId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new[] { MakeAttendance(userId, shift.Id, clinicId, now.AddMinutes(-25)) });

        var result = await CreateService().GetLiveStatusAsync();

        var clinic = result.Clinics.Single();
        clinic.PresentCount.Should().Be(1);
        clinic.Shifts.Single().Professionals.Single().Status.Should().Be(LiveAttendanceStatus.Presente);
    }

    [Fact]
    public async Task GetLiveStatusAsync_NoCheckIn_WithinTolerance_IsEscalado()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        // turno começou há 5 minutos, tolerância é 15 — ainda dentro da tolerância
        var shiftStart = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(5));
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão", Date = now.Date,
            StartTime = shiftStart, EndTime = shiftStart.Add(TimeSpan.FromHours(12)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dr. Teste") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings(toleranceMin: 15, absenceThresholdMin: 60));
        SetupNoop(clinicId);

        var result = await CreateService().GetLiveStatusAsync();

        var prof = result.Clinics.Single().Shifts.Single().Professionals.Single();
        prof.Status.Should().Be(LiveAttendanceStatus.Escalado);
    }

    [Fact]
    public async Task GetLiveStatusAsync_NoCheckIn_PastTolerance_IsAtrasado()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        // turno começou há 30 min, tolerância 15, threshold ausência 60 — atrasado
        var shiftStart = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(30));
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão", Date = now.Date,
            StartTime = shiftStart, EndTime = shiftStart.Add(TimeSpan.FromHours(12)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dr. Atrasado") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings(toleranceMin: 15, absenceThresholdMin: 60));
        SetupNoop(clinicId);

        var result = await CreateService().GetLiveStatusAsync();

        var clinic = result.Clinics.Single();
        clinic.LateCount.Should().Be(1);
        clinic.Shifts.Single().Professionals.Single().Status.Should().Be(LiveAttendanceStatus.Atrasado);
    }

    [Fact]
    public async Task GetLiveStatusAsync_NoCheckIn_PastAbsenceThreshold_IsAusente()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        // turno começou há 90 min, threshold ausência é 60 — ausente
        var shiftStart = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(90));
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão", Date = now.Date,
            StartTime = shiftStart, EndTime = shiftStart.Add(TimeSpan.FromHours(12)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dr. Ausente") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings(toleranceMin: 15, absenceThresholdMin: 60));
        SetupNoop(clinicId);

        var result = await CreateService().GetLiveStatusAsync();

        var clinic = result.Clinics.Single();
        clinic.AbsentCount.Should().Be(1);
        clinic.Shifts.Single().Professionals.Single().Status.Should().Be(LiveAttendanceStatus.Ausente);
    }

    [Fact]
    public async Task GetLiveStatusAsync_FutureShift_AllProfessionalsAreEscalado()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        // turno começa em 2h (futuro)
        var shiftStart = now.TimeOfDay.Add(TimeSpan.FromHours(2));
        if (shiftStart >= TimeSpan.FromDays(1)) return; // evita virar o dia no teste (edge case improvável)
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão Futuro", Date = now.Date,
            StartTime = shiftStart, EndTime = shiftStart.Add(TimeSpan.FromHours(8)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dr. Futuro") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        SetupNoop(clinicId);

        var result = await CreateService().GetLiveStatusAsync();

        var liveShift = result.Clinics.Single().Shifts.Single();
        liveShift.IsActive.Should().BeFalse();
        liveShift.Professionals.Single().Status.Should().Be(LiveAttendanceStatus.Escalado);
    }

    [Fact]
    public async Task GetLiveStatusAsync_ClinicSpecificTolerance_OverridesGlobal()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        // turno começou há 20 min. Tolerância global = 15 (viraria atrasado),
        // mas a clínica tem override de 30 min — deve ficar "escalado" ainda.
        var shiftStart = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(20));
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão", Date = now.Date,
            StartTime = shiftStart, EndTime = shiftStart.Add(TimeSpan.FromHours(12)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dr. Tolerado") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId, toleranceOverride: 30));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings(toleranceMin: 15, absenceThresholdMin: 60));
        SetupNoop(clinicId);

        var result = await CreateService().GetLiveStatusAsync();

        var prof = result.Clinics.Single().Shifts.Single().Professionals.Single();
        prof.Status.Should().Be(LiveAttendanceStatus.Escalado);
    }

    // ─── Agregações e status da UPA ─────────────────────────────────────────

    [Fact]
    public async Task GetLiveStatusAsync_ClinicWithAbsence_StatusIsCritico()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var shiftStart = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(90));
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão", Date = now.Date,
            StartTime = shiftStart, EndTime = shiftStart.Add(TimeSpan.FromHours(12)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dr. Ausente") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings(toleranceMin: 15, absenceThresholdMin: 60));
        SetupNoop(clinicId);

        var result = await CreateService().GetLiveStatusAsync();

        result.Clinics.Single().Status.Should().Be(ClinicLiveStatus.Critico);
    }

    [Fact]
    public async Task GetLiveStatusAsync_ClinicWithLateOnly_StatusIsAtencao()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var shiftStart = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(30));
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão", Date = now.Date,
            StartTime = shiftStart, EndTime = shiftStart.Add(TimeSpan.FromHours(12)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dr. Atrasado") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings(toleranceMin: 15, absenceThresholdMin: 60));
        SetupNoop(clinicId);

        var result = await CreateService().GetLiveStatusAsync();

        result.Clinics.Single().Status.Should().Be(ClinicLiveStatus.Atencao);
    }

    [Fact]
    public async Task GetLiveStatusAsync_AllPresent_StatusIsOk()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var shiftStart = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(10));
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão", Date = now.Date,
            StartTime = shiftStart, EndTime = shiftStart.Add(TimeSpan.FromHours(12)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dr. Presente") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _attRepo.Setup(r => r.GetByClinicAndDateRangeAsync(clinicId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new[] { MakeAttendance(userId, shiftId, clinicId, now.AddMinutes(-5)) });

        var result = await CreateService().GetLiveStatusAsync();

        result.Clinics.Single().Status.Should().Be(ClinicLiveStatus.Ok);
    }

    [Fact]
    public async Task GetLiveStatusAsync_ShiftsFromOtherDays_AreExcluded()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var yesterday = DateTime.UtcNow.Date.AddDays(-1);
        var shiftId = Guid.NewGuid();
        var oldShift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão de ontem", Date = yesterday,
            StartTime = TimeSpan.FromHours(7), EndTime = TimeSpan.FromHours(19), CreatedAt = yesterday,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dr. Ontem") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { oldShift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        SetupNoop(clinicId);

        var result = await CreateService().GetLiveStatusAsync();

        result.Clinics.Single().Shifts.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLiveStatusAsync_MultipleClinics_AggregatesTotalsAcrossAll()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var shiftAId = Guid.NewGuid();
        var shiftA = new Shift
        {
            Id = shiftAId, ClinicId = clinicA, Title = "Plantão A", Date = now.Date,
            StartTime = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(5)),
            EndTime = now.TimeOfDay.Add(TimeSpan.FromHours(8)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftAId, userA, "Dr. A") },
        };
        var shiftBId = Guid.NewGuid();
        var shiftB = new Shift
        {
            Id = shiftBId, ClinicId = clinicB, Title = "Plantão B", Date = now.Date,
            StartTime = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(90)),
            EndTime = now.TimeOfDay.Add(TimeSpan.FromHours(8)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftBId, userB, "Dr. B") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicA, clinicB });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicA)).ReturnsAsync(MakeClinic(clinicA, "UPA A"));
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicB)).ReturnsAsync(MakeClinic(clinicB, "UPA B"));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicA)).ReturnsAsync(new[] { shiftA });
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicB)).ReturnsAsync(new[] { shiftB });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings(toleranceMin: 15, absenceThresholdMin: 60));
        _attRepo.Setup(r => r.GetByClinicAndDateRangeAsync(clinicA, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new[] { MakeAttendance(userA, shiftAId, clinicA, now.AddMinutes(-3)) });
        SetupNoop(clinicB);

        var result = await CreateService().GetLiveStatusAsync();

        result.Clinics.Should().HaveCount(2);
        result.TotalPresent.Should().Be(1); // Dr. A
        result.TotalAbsent.Should().Be(1);  // Dr. B (90 min > threshold 60)
    }

    [Fact]
    public async Task GetLiveStatusAsync_LastCheckIn_PopulatesLastEventDescription()
    {
        var clinicId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var shiftId = Guid.NewGuid();
        var shift = new Shift
        {
            Id = shiftId, ClinicId = clinicId, Title = "Plantão", Date = now.Date,
            StartTime = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(10)),
            EndTime = now.TimeOfDay.Add(TimeSpan.FromHours(8)), CreatedAt = now,
            ShiftAssignments = new List<ShiftAssignment> { MakeAssignment(shiftId, userId, "Dra. Evento") },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(MakeClinic(clinicId, "UPA Evento"));
        _shiftRepo.Setup(r => r.GetByClinicIdAsync(clinicId)).ReturnsAsync(new[] { shift });
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _attRepo.Setup(r => r.GetByClinicAndDateRangeAsync(clinicId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new[] { MakeAttendance(userId, shiftId, clinicId, now.AddMinutes(-5)) });

        var result = await CreateService().GetLiveStatusAsync();

        var clinic = result.Clinics.Single();
        clinic.LastEventDescription.Should().Contain("Dra. Evento").And.Contain("check-in");
        result.RecentEvents.Should().ContainSingle(e => e.ClinicName == "UPA Evento");
    }
}
