using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

/// <summary>
/// Cobre:
///   • Regras do check-in (assignment + "só um plantão ativo por vez")
///   • Scan cross-clinic do GetMyActiveAsync
///
/// O check-out não está aqui (já é coberto por AttendanceSyncServiceTests
/// no fluxo offline; a lógica online é praticamente igual).
/// </summary>
public class AttendanceServiceTests
{
    private readonly Mock<IAttendanceRepository> _attRepo = new();
    private readonly Mock<IShiftRepository> _shiftRepo = new();
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<IFaceEnrollmentRepository> _faceRepo = new();
    private readonly Mock<ISettingsRepository> _settingsRepo = new();

    private AttendanceService CreateService()
        => new(_attRepo.Object, _shiftRepo.Object, _clinicRepo.Object, _tenant.Object, _faceRepo.Object, new Mock<IBiometricProofService>().Object, _settingsRepo.Object);

    private static CheckInRequest ValidRequest(Guid shiftId) => new()
    {
        ShiftId = shiftId,
        Latitude = -23.5505,
        Longitude = -46.6333,
        DeviceId = "test-device",
        BiometricValidated = true,
    };

    private void SetupAuthenticated(Guid userId, Guid clinicId)
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetCurrentClinicId()).Returns(clinicId);
    }

    // ─────────────────────────────────────────────────────────────
    // CheckInAsync
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task CheckInAsync_NoUserContext_ShouldThrowUnauthorized()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);

        var act = () => CreateService().CheckInAsync(ValidRequest(Guid.NewGuid()));

        await act.Should().ThrowAsync<UnauthorizedException>();
    }

    [Fact]
    public async Task CheckInAsync_NoClinicContext_ShouldThrowUnauthorized()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(Guid.NewGuid());
        _tenant.Setup(t => t.GetCurrentClinicId()).Returns((Guid?)null);

        var act = () => CreateService().CheckInAsync(ValidRequest(Guid.NewGuid()));

        await act.Should().ThrowAsync<UnauthorizedException>();
    }

    [Fact]
    public async Task CheckInAsync_UserNotAssignedToShift_ShouldThrowForbidden()
    {
        var userId = Guid.NewGuid();
        var shiftId = Guid.NewGuid();
        SetupAuthenticated(userId, Guid.NewGuid());

        _shiftRepo.Setup(r => r.AssignmentExistsAsync(shiftId, userId)).ReturnsAsync(false);

        var act = () => CreateService().CheckInAsync(ValidRequest(shiftId));

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*não está atribuído*");
    }

    [Fact]
    public async Task CheckInAsync_WhenUserHasAnotherActiveCheckIn_ShouldThrowConflict()
    {
        // Regra de negócio nova: um profissional só pode ter UM plantão em
        // andamento por vez, em qualquer clínica. O check-in em um segundo
        // shift deve ser bloqueado até fechar o primeiro.
        var userId = Guid.NewGuid();
        var shiftId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        SetupAuthenticated(userId, clinicId);

        _shiftRepo.Setup(r => r.AssignmentExistsAsync(shiftId, userId)).ReturnsAsync(true);
        _attRepo.Setup(r => r.HasAnyActiveCheckInAsync(userId)).ReturnsAsync(true);

        // O novo fluxo busca o active pra incluir no body do 409
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _attRepo.Setup(r => r.GetActiveByUserAndClinicAsync(userId, clinicId))
            .ReturnsAsync(new[] { new Attendance
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                ShiftId = Guid.NewGuid(),
                ClinicId = clinicId,
                CheckInTime = DateTime.UtcNow,
                CheckInLatitude = 0,
                CheckInLongitude = 0,
                CheckInDeviceId = "d",
                BiometricValidated = true,
            }});

        var act = () => CreateService().CheckInAsync(ValidRequest(shiftId));

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*já tem um plantão em andamento*");

        // Não deve chegar a criar o Attendance
        _attRepo.Verify(r => r.AddAsync(It.IsAny<Attendance>()), Times.Never);
    }

    [Fact]
    public async Task CheckInAsync_WithNoActiveCheckIn_ShouldCreateAttendance()
    {
        var userId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var shiftId = Guid.NewGuid();
        SetupAuthenticated(userId, clinicId);

        _shiftRepo.Setup(r => r.AssignmentExistsAsync(shiftId, userId)).ReturnsAsync(true);
        _attRepo.Setup(r => r.HasAnyActiveCheckInAsync(userId)).ReturnsAsync(false);

        Attendance? captured = null;
        _attRepo.Setup(r => r.AddAsync(It.IsAny<Attendance>()))
            .Callback<Attendance>(a => captured = a)
            .Returns(Task.CompletedTask);

        var response = await CreateService().CheckInAsync(ValidRequest(shiftId));

        response.Should().NotBeNull();
        response.UserId.Should().Be(userId);
        response.ShiftId.Should().Be(shiftId);
        response.ClinicId.Should().Be(clinicId);

        captured.Should().NotBeNull();
        captured!.CheckInLatitude.Should().Be(-23.5505);
        captured.CheckOutTime.Should().BeNull(); // check-out ainda em aberto
    }

    // ─────────────────────────────────────────────────────────────
    // GetMyActiveAsync — precisa varrer todas as clínicas autorizadas
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyActiveAsync_NoUserContext_ShouldThrowUnauthorized()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);

        var act = () => CreateService().GetMyActiveAsync();

        await act.Should().ThrowAsync<UnauthorizedException>();
    }

    [Fact]
    public async Task GetMyActiveAsync_NoAuthorizedClinics_ReturnsEmpty()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(Guid.NewGuid());
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Array.Empty<Guid>());

        var result = await CreateService().GetMyActiveAsync();

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetMyActiveAsync_AggregatesActiveCheckInsAcrossAllAuthorizedClinics()
    {
        // Caso típico do médico multi-clínica: check-in aberto na Alpha,
        // check-in aberto na Beta. GetMyActive deve trazer os dois pra o
        // modal de check-out mostrar as duas opções.
        var userId = Guid.NewGuid();
        var alpha = Guid.NewGuid();
        var beta = Guid.NewGuid();

        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { alpha, beta });

        _attRepo.Setup(r => r.GetActiveByUserAndClinicAsync(userId, alpha))
            .ReturnsAsync(new[] { new Attendance { Id = Guid.NewGuid(), ClinicId = alpha, ShiftId = Guid.NewGuid(), UserId = userId, CheckInTime = DateTime.UtcNow } });
        _attRepo.Setup(r => r.GetActiveByUserAndClinicAsync(userId, beta))
            .ReturnsAsync(new[] { new Attendance { Id = Guid.NewGuid(), ClinicId = beta, ShiftId = Guid.NewGuid(), UserId = userId, CheckInTime = DateTime.UtcNow } });

        var result = (await CreateService().GetMyActiveAsync()).ToList();

        result.Should().HaveCount(2);
        result.Select(r => r.ClinicId).Should().Contain(new[] { alpha, beta });
    }

    [Fact]
    public async Task GetMyActiveAsync_IgnoresClinicsWithNoActiveCheckIns()
    {
        var userId = Guid.NewGuid();
        var alpha = Guid.NewGuid();
        var beta = Guid.NewGuid();

        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { alpha, beta });

        _attRepo.Setup(r => r.GetActiveByUserAndClinicAsync(userId, alpha))
            .ReturnsAsync(new[] { new Attendance { Id = Guid.NewGuid(), ClinicId = alpha, ShiftId = Guid.NewGuid(), UserId = userId, CheckInTime = DateTime.UtcNow } });
        _attRepo.Setup(r => r.GetActiveByUserAndClinicAsync(userId, beta))
            .ReturnsAsync(Array.Empty<Attendance>());

        var result = (await CreateService().GetMyActiveAsync()).ToList();

        result.Should().ContainSingle().Which.ClinicId.Should().Be(alpha);
    }
}
