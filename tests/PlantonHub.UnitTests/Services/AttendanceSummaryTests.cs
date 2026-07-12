using FluentAssertions;
using Moq;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

public class AttendanceSummaryTests
{
    private readonly Mock<IAttendanceRepository> _attRepo = new();
    private readonly Mock<IShiftRepository> _shiftRepo = new();
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<IFaceEnrollmentRepository> _faceRepo = new();

    private AttendanceService CreateService() =>
        new(_attRepo.Object, _shiftRepo.Object, _clinicRepo.Object, _tenant.Object, _faceRepo.Object);

    private void SetupUser(Guid userId, Guid clinicId)
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(userId);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
    }

    [Fact]
    public async Task GetSummaryAsync_NoUser_ThrowsUnauthorized()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns((Guid?)null);
        var service = CreateService();

        var act = () => service.GetSummaryAsync(null, null);

        await act.Should().ThrowAsync<Application.Exceptions.UnauthorizedException>();
    }

    [Fact]
    public async Task GetSummaryAsync_NoClinics_ReturnsEmpty()
    {
        _tenant.Setup(t => t.GetCurrentUserId()).Returns(Guid.NewGuid());
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Enumerable.Empty<Guid>());
        var service = CreateService();

        var result = await service.GetSummaryAsync(null, null);

        result.TotalDaysWorked.Should().Be(0);
        result.TotalHoursWorked.Should().Be(0);
    }

    [Fact]
    public async Task GetSummaryAsync_WithCompletedShifts_CalculatesCorrectly()
    {
        var userId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var shiftId1 = Guid.NewGuid();
        var shiftId2 = Guid.NewGuid();
        SetupUser(userId, clinicId);

        var today = DateTime.UtcNow.Date;
        var yesterday = today.AddDays(-1);

        // Two completed attendances on different days (8h each)
        _attRepo.Setup(r => r.GetHistoryByUserAndClinicAsync(userId, clinicId))
            .ReturnsAsync(new[]
            {
                new Attendance { Id = Guid.NewGuid(), UserId = userId, ShiftId = shiftId1, ClinicId = clinicId, CheckInTime = today.AddHours(8), CheckOutTime = today.AddHours(16) },
                new Attendance { Id = Guid.NewGuid(), UserId = userId, ShiftId = shiftId2, ClinicId = clinicId, CheckInTime = yesterday.AddHours(8), CheckOutTime = yesterday.AddHours(16) },
            });

        // 3 shifts assigned total — 1 absence
        _shiftRepo.Setup(r => r.GetByUserIdAsync(userId))
            .ReturnsAsync(new[]
            {
                new Shift { Id = shiftId1, ClinicId = clinicId, Date = today, Title = "T1", StartTime = TimeSpan.FromHours(8), EndTime = TimeSpan.FromHours(16) },
                new Shift { Id = shiftId2, ClinicId = clinicId, Date = yesterday, Title = "T2", StartTime = TimeSpan.FromHours(8), EndTime = TimeSpan.FromHours(16) },
                new Shift { Id = Guid.NewGuid(), ClinicId = clinicId, Date = today.AddDays(-2), Title = "T3", StartTime = TimeSpan.FromHours(8), EndTime = TimeSpan.FromHours(16) },
            });

        var service = CreateService();
        var result = await service.GetSummaryAsync(null, null);

        result.TotalDaysWorked.Should().Be(2);
        result.TotalHoursWorked.Should().Be(16);
        result.TotalShiftsAssigned.Should().Be(3);
        result.TotalAbsences.Should().Be(1);
        result.AverageHoursPerDay.Should().Be(8);
    }

    [Fact]
    public async Task GetSummaryAsync_WithDateFilter_FiltersCorrectly()
    {
        var userId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        SetupUser(userId, clinicId);

        var today = DateTime.UtcNow.Date;

        _attRepo.Setup(r => r.GetHistoryByUserAndClinicAsync(userId, clinicId))
            .ReturnsAsync(new[]
            {
                new Attendance { Id = Guid.NewGuid(), UserId = userId, ShiftId = Guid.NewGuid(), ClinicId = clinicId, CheckInTime = today.AddHours(8), CheckOutTime = today.AddHours(16) },
                new Attendance { Id = Guid.NewGuid(), UserId = userId, ShiftId = Guid.NewGuid(), ClinicId = clinicId, CheckInTime = today.AddDays(-30).AddHours(8), CheckOutTime = today.AddDays(-30).AddHours(16) },
            });

        _shiftRepo.Setup(r => r.GetByUserIdAsync(userId)).ReturnsAsync(Enumerable.Empty<Shift>());

        var service = CreateService();
        // Filter to last 7 days — only one record
        var result = await service.GetSummaryAsync(today.AddDays(-7), today.AddDays(1));

        result.TotalDaysWorked.Should().Be(1);
        result.TotalHoursWorked.Should().Be(8);
        result.FromDate.Should().Be(today.AddDays(-7));
        result.ToDate.Should().Be(today.AddDays(1));
    }

    [Fact]
    public async Task GetSummaryAsync_OnlyOpenCheckIns_HoursNotCounted()
    {
        var userId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        SetupUser(userId, clinicId);

        // Check-in without check-out (still working)
        _attRepo.Setup(r => r.GetHistoryByUserAndClinicAsync(userId, clinicId))
            .ReturnsAsync(new[]
            {
                new Attendance { Id = Guid.NewGuid(), UserId = userId, ShiftId = Guid.NewGuid(), ClinicId = clinicId, CheckInTime = DateTime.UtcNow.AddHours(-2), CheckOutTime = null },
            });

        _shiftRepo.Setup(r => r.GetByUserIdAsync(userId)).ReturnsAsync(Enumerable.Empty<Shift>());

        var service = CreateService();
        var result = await service.GetSummaryAsync(null, null);

        result.TotalDaysWorked.Should().Be(1); // day counted (they showed up)
        result.TotalHoursWorked.Should().Be(0); // but hours not counted (incomplete)
    }
}
