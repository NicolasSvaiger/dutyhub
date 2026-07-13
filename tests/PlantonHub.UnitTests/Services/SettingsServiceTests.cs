using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Settings;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

public class SettingsServiceTests
{
    private readonly Mock<ISettingsRepository> _settingsRepo = new();
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<ITenantService> _tenant = new();

    private SettingsService CreateService() =>
        new(_settingsRepo.Object, _clinicRepo.Object, _tenant.Object);

    private static SystemSettings DefaultSettings() => new()
    {
        Id = SystemSettings.SingletonId,
        CheckInToleranceMinutes = 15,
        AbsenceThresholdMinutes = 60,
        CheckInBlockAfterMinutes = 120,
        NotifyOnAbsence = true,
        UpdatedAt = DateTime.UtcNow,
    };

    private static Clinic MakeClinic(Guid? id = null, string name = "UPA Teste", int? tolerance = null) => new()
    {
        Id = id ?? Guid.NewGuid(),
        Name = name,
        IsActive = true,
        CreatedAt = DateTime.UtcNow,
        ShiftTemplates = new List<ClinicShiftTemplate>(),
        CheckInToleranceMinutes = tolerance,
    };

    // ── GetAsync ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAsync_ReturnsGlobalSettingsFromRepository()
    {
        var settings = DefaultSettings();
        settings.CheckInToleranceMinutes = 20;
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(settings);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        var result = await CreateService().GetAsync();

        result.CheckInToleranceMinutes.Should().Be(20);
        result.AbsenceThresholdMinutes.Should().Be(60);
        result.CheckInBlockAfterMinutes.Should().Be(120);
        result.NotifyOnAbsence.Should().BeTrue();
    }

    [Fact]
    public async Task GetAsync_ReturnsClinicTolerances()
    {
        var clinicId = Guid.NewGuid();
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[]
        {
            MakeClinic(clinicId, "UPA Alpha", tolerance: 10),
        });

        var result = await CreateService().GetAsync();

        result.ClinicTolerances.Should().HaveCount(1);
        result.ClinicTolerances[0].ClinicId.Should().Be(clinicId);
        result.ClinicTolerances[0].ClinicName.Should().Be("UPA Alpha");
        result.ClinicTolerances[0].CheckInToleranceMinutes.Should().Be(10);
    }

    [Fact]
    public async Task GetAsync_ClinicWithNullTolerance_ReturnsNullInDto()
    {
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[]
        {
            MakeClinic(tolerance: null), // uses global
        });

        var result = await CreateService().GetAsync();

        result.ClinicTolerances[0].CheckInToleranceMinutes.Should().BeNull();
    }

    [Fact]
    public async Task GetAsync_NoClinics_ReturnsEmptyList()
    {
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        var result = await CreateService().GetAsync();

        result.ClinicTolerances.Should().BeEmpty();
    }

    // ── UpdateAsync — authorization ───────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_NonAdmin_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);

        var act = () => CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
        });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ── UpdateAsync — global settings ─────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_AdminGlobal_SavesGlobalSettings()
    {
        SystemSettings? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>()))
            .Callback<SystemSettings>(s => captured = s)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 25,
            AbsenceThresholdMinutes = 90,
            CheckInBlockAfterMinutes = 180,
            NotifyOnAbsence = false,
        });

        captured.Should().NotBeNull();
        captured!.CheckInToleranceMinutes.Should().Be(25);
        captured.AbsenceThresholdMinutes.Should().Be(90);
        captured.CheckInBlockAfterMinutes.Should().Be(180);
        captured.NotifyOnAbsence.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateAsync_ClampsToleranceBelowMin()
    {
        SystemSettings? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>()))
            .Callback<SystemSettings>(s => captured = s)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 0, // below min of 5
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
        });

        captured!.CheckInToleranceMinutes.Should().Be(5); // clamped to min
    }

    [Fact]
    public async Task UpdateAsync_ClampsToleranceAboveMax()
    {
        SystemSettings? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>()))
            .Callback<SystemSettings>(s => captured = s)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 999, // above max of 120
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
        });

        captured!.CheckInToleranceMinutes.Should().Be(120); // clamped to max
    }

    [Fact]
    public async Task UpdateAsync_SetsUpdatedAtToUtcNow()
    {
        var before = DateTime.UtcNow.AddSeconds(-1);
        SystemSettings? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>()))
            .Callback<SystemSettings>(s => captured = s)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
        });

        captured!.UpdatedAt.Should().BeAfter(before);
        captured.UpdatedAt.Kind.Should().Be(DateTimeKind.Utc);
    }

    // ── UpdateAsync — per-clinic tolerances ───────────────────────────────────

    [Fact]
    public async Task UpdateAsync_SavesClinicToleranceOverride()
    {
        var clinicId = Guid.NewGuid();
        var clinic = MakeClinic(clinicId);
        Clinic? capturedClinic = null;

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>())).Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(clinic);
        _clinicRepo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>()))
            .Callback<Clinic>(c => capturedClinic = c)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { clinic });

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            ClinicTolerances = new List<ClinicToleranceUpdate>
            {
                new() { ClinicId = clinicId, CheckInToleranceMinutes = 30 },
            },
        });

        capturedClinic.Should().NotBeNull();
        capturedClinic!.CheckInToleranceMinutes.Should().Be(30);
    }

    [Fact]
    public async Task UpdateAsync_NullClinicTolerance_SetsNull_UsesGlobal()
    {
        var clinicId = Guid.NewGuid();
        var clinic = MakeClinic(clinicId, tolerance: 20);
        Clinic? capturedClinic = null;

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>())).Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(clinic);
        _clinicRepo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>()))
            .Callback<Clinic>(c => capturedClinic = c)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { clinic });

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            ClinicTolerances = new List<ClinicToleranceUpdate>
            {
                new() { ClinicId = clinicId, CheckInToleranceMinutes = null }, // reset to global
            },
        });

        capturedClinic!.CheckInToleranceMinutes.Should().BeNull();
    }

    [Fact]
    public async Task UpdateAsync_UnknownClinicId_SkipsWithoutError()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>())).Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Clinic?)null);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        var act = () => CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            ClinicTolerances = new List<ClinicToleranceUpdate>
            {
                new() { ClinicId = Guid.NewGuid(), CheckInToleranceMinutes = 20 },
            },
        });

        await act.Should().NotThrowAsync();
        _clinicRepo.Verify(r => r.UpdateAsync(It.IsAny<Clinic>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_ClampsClinicToleranceToMin()
    {
        var clinicId = Guid.NewGuid();
        var clinic = MakeClinic(clinicId);
        Clinic? capturedClinic = null;

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>())).Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId)).ReturnsAsync(clinic);
        _clinicRepo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>()))
            .Callback<Clinic>(c => capturedClinic = c)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { clinic });

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            ClinicTolerances = new List<ClinicToleranceUpdate>
            {
                new() { ClinicId = clinicId, CheckInToleranceMinutes = -5 }, // below min
            },
        });

        capturedClinic!.CheckInToleranceMinutes.Should().Be(5);
    }

    [Fact]
    public async Task UpdateAsync_EmptyClinicTolerances_DoesNotCallUpdateAsync()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(DefaultSettings());
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>())).Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            ClinicTolerances = new List<ClinicToleranceUpdate>(), // empty
        });

        _clinicRepo.Verify(r => r.UpdateAsync(It.IsAny<Clinic>()), Times.Never);
    }

    // ── UpdateAsync — response ────────────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_ReturnsUpdatedSettingsAfterSave()
    {
        var settings = DefaultSettings();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        // GetAsync is called twice: once to load before save, once at end to build response
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(() => settings);
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>()))
            .Callback<SystemSettings>(s => { settings.CheckInToleranceMinutes = s.CheckInToleranceMinutes; })
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        var result = await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 30,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
        });

        result.CheckInToleranceMinutes.Should().Be(30);
    }
}
