using System.Text.Json;
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

    // ── GetAsync — extended fields (fusos, notificações, biometria, sistema) ──

    [Fact]
    public async Task GetAsync_ReturnsFusosFields()
    {
        var settings = DefaultSettings();
        settings.SystemTimezone = "America/Manaus (UTC-4)";
        settings.DaylightSavingAuto = false;
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(settings);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        var result = await CreateService().GetAsync();

        result.SystemTimezone.Should().Be("America/Manaus (UTC-4)");
        result.DaylightSavingAuto.Should().BeFalse();
    }

    [Fact]
    public async Task GetAsync_DeserializesNotificationChannelsJson()
    {
        var settings = DefaultSettings();
        settings.NotificationChannelsJson = "{\"Ausência detectada\":{\"email\":true,\"sms\":false,\"push\":true}}";
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(settings);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        var result = await CreateService().GetAsync();

        result.NotificationChannels.Should().ContainKey("Ausência detectada");
        result.NotificationChannels["Ausência detectada"].Email.Should().BeTrue();
        result.NotificationChannels["Ausência detectada"].Sms.Should().BeFalse();
        result.NotificationChannels["Ausência detectada"].Push.Should().BeTrue();
    }

    [Fact]
    public async Task GetAsync_InvalidNotificationChannelsJson_FallsBackToEmptyDictionary()
    {
        var settings = DefaultSettings();
        settings.NotificationChannelsJson = "{not-valid-json";
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(settings);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        var result = await CreateService().GetAsync();

        result.NotificationChannels.Should().BeEmpty();
    }

    [Fact]
    public async Task GetAsync_ReturnsBiometriaFields()
    {
        var settings = DefaultSettings();
        settings.BiometricConfidencePercent = 85;
        settings.BiometricMaxAttempts = 5;
        settings.BiometricAllowManualCheckin = false;
        settings.BiometricLogFailedAttempt = true;
        settings.AzureEndpoint = "https://custom.cognitiveservices.azure.com";
        settings.AzureRegion = "East US";
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(settings);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        var result = await CreateService().GetAsync();

        result.BiometricConfidencePercent.Should().Be(85);
        result.BiometricMaxAttempts.Should().Be(5);
        result.BiometricAllowManualCheckin.Should().BeFalse();
        result.BiometricLogFailedAttempt.Should().BeTrue();
        result.AzureEndpoint.Should().Be("https://custom.cognitiveservices.azure.com");
        result.AzureRegion.Should().Be("East US");
    }

    [Fact]
    public async Task GetAsync_ReturnsSistemaFields()
    {
        var settings = DefaultSettings();
        settings.OrgName = "Organização Teste";
        settings.OrgCnpj = "11.222.333/0001-44";
        settings.OrgEmail = "contato@teste.org";
        settings.SessionTimeoutMinutes = 60;
        settings.MfaRequired = false;
        settings.PasswordRotationDays = 180;
        settings.DetailedAuditLog = false;
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(settings);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        var result = await CreateService().GetAsync();

        result.OrgName.Should().Be("Organização Teste");
        result.OrgCnpj.Should().Be("11.222.333/0001-44");
        result.OrgEmail.Should().Be("contato@teste.org");
        result.SessionTimeoutMinutes.Should().Be(60);
        result.MfaRequired.Should().BeFalse();
        result.PasswordRotationDays.Should().Be(180);
        result.DetailedAuditLog.Should().BeFalse();
    }

    // ── UpdateAsync — Fusos ────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_SavesFusosFields()
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
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            SystemTimezone = "America/Manaus (UTC-4)",
            DaylightSavingAuto = false,
        });

        captured!.SystemTimezone.Should().Be("America/Manaus (UTC-4)");
        captured.DaylightSavingAuto.Should().BeFalse();
    }

    // ── UpdateAsync — Notificações ─────────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_SavesNotificationChannelsAsJson()
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
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            NotificationChannels = new Dictionary<string, NotifChannelUpdate>
            {
                ["Ausência detectada"] = new() { Email = true, Sms = false, Push = true },
            },
            EmailSender = "alerta@24p7.com.br",
            EmailSenderName = "Alertas 24p7",
            EmailCc = "coord@24p7.com.br",
        });

        captured.Should().NotBeNull();
        captured!.NotificationChannelsJson.Should().NotBeNullOrWhiteSpace();
        captured.EmailSender.Should().Be("alerta@24p7.com.br");
        captured.EmailSenderName.Should().Be("Alertas 24p7");
        captured.EmailCc.Should().Be("coord@24p7.com.br");

        // Round-trip: the persisted JSON must deserialize back to the same values
        var roundTrip = JsonSerializer.Deserialize<Dictionary<string, NotifChannelDto>>(
            captured.NotificationChannelsJson, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        roundTrip!["Ausência detectada"].Email.Should().BeTrue();
        roundTrip["Ausência detectada"].Sms.Should().BeFalse();
        roundTrip["Ausência detectada"].Push.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateAsync_EmptyNotificationChannels_KeepsExistingJson()
    {
        var existing = DefaultSettings();
        existing.NotificationChannelsJson = "{\"Escala publicada\":{\"email\":true,\"sms\":false,\"push\":false}}";
        SystemSettings? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(existing);
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>()))
            .Callback<SystemSettings>(s => captured = s)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            NotificationChannels = new Dictionary<string, NotifChannelUpdate>(), // empty — should not overwrite
        });

        captured!.NotificationChannelsJson.Should().Be(existing.NotificationChannelsJson);
    }

    // ── UpdateAsync — Biometria (clamping) ─────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_ClampsBiometricConfidenceBelowMin()
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
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            BiometricConfidencePercent = 10, // below min of 50
        });

        captured!.BiometricConfidencePercent.Should().Be(50);
    }

    [Fact]
    public async Task UpdateAsync_ClampsBiometricConfidenceAboveMax()
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
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            BiometricConfidencePercent = 999, // above max of 99
        });

        captured!.BiometricConfidencePercent.Should().Be(99);
    }

    [Fact]
    public async Task UpdateAsync_ClampsBiometricMaxAttemptsBelowMin()
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
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            BiometricMaxAttempts = 0, // below min of 1
        });

        captured!.BiometricMaxAttempts.Should().Be(1);
    }

    [Fact]
    public async Task UpdateAsync_ClampsBiometricMaxAttemptsAboveMax()
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
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            BiometricMaxAttempts = 99, // above max of 10
        });

        captured!.BiometricMaxAttempts.Should().Be(10);
    }

    [Fact]
    public async Task UpdateAsync_SavesBiometriaToggleFields()
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
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            BiometricAllowManualCheckin = false,
            BiometricLogFailedAttempt = true,
            AzureEndpoint = "https://custom.cognitiveservices.azure.com",
            AzureRegion = "West Europe",
        });

        captured!.BiometricAllowManualCheckin.Should().BeFalse();
        captured.BiometricLogFailedAttempt.Should().BeTrue();
        captured.AzureEndpoint.Should().Be("https://custom.cognitiveservices.azure.com");
        captured.AzureRegion.Should().Be("West Europe");
    }

    [Fact]
    public async Task UpdateAsync_BlankAzureEndpoint_KeepsExistingValue()
    {
        var existing = DefaultSettings();
        existing.AzureEndpoint = "https://existing.cognitiveservices.azure.com";
        SystemSettings? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(existing);
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>()))
            .Callback<SystemSettings>(s => captured = s)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            AzureEndpoint = "   ", // blank — should not overwrite
        });

        captured!.AzureEndpoint.Should().Be("https://existing.cognitiveservices.azure.com");
    }

    // ── UpdateAsync — Sistema ──────────────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_SavesSistemaFields()
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
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            OrgName = "Organização Teste",
            OrgCnpj = "11.222.333/0001-44",
            OrgEmail = "contato@teste.org",
            SessionTimeoutMinutes = 60,
            MfaRequired = false,
            PasswordRotationDays = 180,
            DetailedAuditLog = false,
        });

        captured!.OrgName.Should().Be("Organização Teste");
        captured.OrgCnpj.Should().Be("11.222.333/0001-44");
        captured.OrgEmail.Should().Be("contato@teste.org");
        captured.SessionTimeoutMinutes.Should().Be(60);
        captured.MfaRequired.Should().BeFalse();
        captured.PasswordRotationDays.Should().Be(180);
        captured.DetailedAuditLog.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateAsync_BlankOrgName_KeepsExistingValue()
    {
        var existing = DefaultSettings();
        existing.OrgName = "Organização Existente";
        SystemSettings? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _settingsRepo.Setup(r => r.GetAsync()).ReturnsAsync(existing);
        _settingsRepo.Setup(r => r.SaveAsync(It.IsAny<SystemSettings>()))
            .Callback<SystemSettings>(s => captured = s)
            .Returns(Task.CompletedTask);
        _clinicRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(Enumerable.Empty<Clinic>());

        await CreateService().UpdateAsync(new UpdateSettingsRequest
        {
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            OrgName = "   ", // blank — should not overwrite
        });

        captured!.OrgName.Should().Be("Organização Existente");
    }

    [Fact]
    public async Task UpdateAsync_SessionTimeoutZero_MeansNever_IsSavedAsZero()
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
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
            CheckInBlockAfterMinutes = 120,
            SessionTimeoutMinutes = 0, // "Nunca"
            PasswordRotationDays = 0,  // "Nunca"
        });

        captured!.SessionTimeoutMinutes.Should().Be(0);
        captured.PasswordRotationDays.Should().Be(0);
    }
}
