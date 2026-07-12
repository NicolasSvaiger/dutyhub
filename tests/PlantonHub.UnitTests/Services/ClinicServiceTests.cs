using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Clinics;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

public class ClinicServiceTests
{
    private readonly Mock<IClinicRepository> _repo = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<ICacheService> _cache = new();

    private ClinicService CreateService() => new(_repo.Object, _tenant.Object, _cache.Object);

    private static Clinic MakeClinic(Guid? id = null, bool isActive = true) => new()
    {
        Id = id ?? Guid.NewGuid(),
        Name = "UPA Teste",
        Address = "Rua X, 100",
        Phone = "11999990001",
        IsActive = isActive,
        CreatedAt = DateTime.UtcNow,
        ShiftTemplates = new List<ClinicShiftTemplate>(),
    };

    // ─── GetAllAsync ──────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAllAsync_NonAdmin_NoAuthorizedClinics_ReturnsEmpty()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Enumerable.Empty<Guid>());

        var result = await CreateService().GetAllAsync();

        result.Should().BeEmpty();
    }

    // ─── CreateAsync ──────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateAsync_NonAdmin_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);

        var act = () => CreateService().CreateAsync(new CreateClinicRequest { Name = "X" });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task CreateAsync_AdminGlobal_PersistsAndReturnsClinic()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.AddAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var request = new CreateClinicRequest
        {
            Name = "UPA Nova",
            Address = "Rua Y, 50",
            Phone = "11999990003",
            Latitude = -23.55,
            Longitude = -46.63,
            AllowedRadiusMeters = 150,
            Capacity = 40,
            DoctorsPerShift = 3,
            HasNursing = true,
            City = "São Paulo",
            Neighborhood = "Centro",
            ZipCode = "01310100",
        };

        var result = await CreateService().CreateAsync(request);

        _repo.Verify(r => r.AddAsync(It.Is<Clinic>(c =>
            c.Name == "UPA Nova" &&
            c.Capacity == 40 &&
            c.HasNursing == true &&
            c.City == "São Paulo"
        )), Times.Once);
        result.Name.Should().Be("UPA Nova");
        result.HasNursing.Should().BeTrue();
    }

    [Fact]
    public async Task CreateAsync_SetsIsActiveTrue()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.AddAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var result = await CreateService().CreateAsync(new CreateClinicRequest { Name = "X" });

        result.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task CreateAsync_InvalidatesCacheAfterCreate()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.AddAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync("clinics:", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await CreateService().CreateAsync(new CreateClinicRequest { Name = "X" });

        _cache.Verify(c => c.RemoveByPrefixAsync("clinics:", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateAsync_MapsAllGeoFields()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.AddAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var req = new CreateClinicRequest
        {
            Name = "Geo UPA",
            Latitude = -22.9,
            Longitude = -43.1,
            AllowedRadiusMeters = 200,
        };

        var result = await CreateService().CreateAsync(req);

        result.Latitude.Should().Be(-22.9);
        result.Longitude.Should().Be(-43.1);
        result.AllowedRadiusMeters.Should().Be(200);
    }

    // ─── UpdateAsync ──────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_NonAdmin_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);

        var act = () => CreateService().UpdateAsync(Guid.NewGuid(), new UpdateClinicRequest { Name = "X" });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task UpdateAsync_ClinicNotFound_ThrowsNotFound()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Clinic?)null);

        var act = () => CreateService().UpdateAsync(Guid.NewGuid(), new UpdateClinicRequest { Name = "X" });

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task UpdateAsync_UpdatesNameAndStatus()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var result = await CreateService().UpdateAsync(id, new UpdateClinicRequest
        {
            Name = "UPA Atualizada",
            IsActive = false,
        });

        result.Name.Should().Be("UPA Atualizada");
        result.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateAsync_UpdatesExtendedFields()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var result = await CreateService().UpdateAsync(id, new UpdateClinicRequest
        {
            Name = "X",
            Capacity = 80,
            DoctorsPerShift = 6,
            City = "Rio de Janeiro",
            Neighborhood = "Centro",
            ZipCode = "20000000",
            Latitude = -22.9,
            Longitude = -43.1,
            AllowedRadiusMeters = 300,
            HasNursing = true,
        });

        result.Capacity.Should().Be(80);
        result.DoctorsPerShift.Should().Be(6);
        result.City.Should().Be("Rio de Janeiro");
        result.HasNursing.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateAsync_InvalidatesCacheAfterUpdate()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync("clinics:", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await CreateService().UpdateAsync(id, new UpdateClinicRequest { Name = "X" });

        _cache.Verify(c => c.RemoveByPrefixAsync("clinics:", It.IsAny<CancellationToken>()), Times.Once);
    }

    // ─── ToggleStatusAsync ────────────────────────────────────────────────────

    [Fact]
    public async Task ToggleStatusAsync_NonAdmin_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);

        var act = () => CreateService().ToggleStatusAsync(Guid.NewGuid());

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task ToggleStatusAsync_ClinicNotFound_ThrowsNotFound()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Clinic?)null);

        var act = () => CreateService().ToggleStatusAsync(Guid.NewGuid());

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task ToggleStatusAsync_ActiveClinic_BecomesInactive()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id, isActive: true));
        _repo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var result = await CreateService().ToggleStatusAsync(id);

        result.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task ToggleStatusAsync_InactiveClinic_BecomesActive()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id, isActive: false));
        _repo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var result = await CreateService().ToggleStatusAsync(id);

        result.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task ToggleStatusAsync_CallsUpdateOnce()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await CreateService().ToggleStatusAsync(id);

        _repo.Verify(r => r.UpdateAsync(It.IsAny<Clinic>()), Times.Once);
    }

    [Fact]
    public async Task ToggleStatusAsync_InvalidatesCache()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.UpdateAsync(It.IsAny<Clinic>())).Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync("clinics:", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await CreateService().ToggleStatusAsync(id);

        _cache.Verify(c => c.RemoveByPrefixAsync("clinics:", It.IsAny<CancellationToken>()), Times.Once);
    }

    // ─── UpsertShiftTemplatesAsync ────────────────────────────────────────────

    [Fact]
    public async Task UpsertShiftTemplatesAsync_NonAdmin_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);

        var act = () => CreateService().UpsertShiftTemplatesAsync(Guid.NewGuid(), new UpsertShiftTemplatesRequest());

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task UpsertShiftTemplatesAsync_ClinicNotFound_ThrowsNotFound()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Clinic?)null);

        var act = () => CreateService().UpsertShiftTemplatesAsync(Guid.NewGuid(), new UpsertShiftTemplatesRequest());

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task UpsertShiftTemplatesAsync_CallsReplaceWithCorrectCount()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.ReplaceShiftTemplatesAsync(id, It.IsAny<IEnumerable<ClinicShiftTemplate>>()))
             .Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var request = new UpsertShiftTemplatesRequest
        {
            Templates = new List<ShiftTemplateItem>
            {
                new ShiftTemplateItem { Name = "Manhã",  StartTime = "07:00:00", EndTime = "19:00:00", RequiredStaff = 4, DisplayOrder = 1, ProfessionalType = 1 },
                new ShiftTemplateItem { Name = "Noite",  StartTime = "19:00:00", EndTime = "07:00:00", RequiredStaff = 4, DisplayOrder = 2, ProfessionalType = 1 },
                new ShiftTemplateItem { Name = "Manhã Enf", StartTime = "07:00:00", EndTime = "19:00:00", RequiredStaff = 2, DisplayOrder = 1, ProfessionalType = 2 },
            }
        };

        await CreateService().UpsertShiftTemplatesAsync(id, request);

        _repo.Verify(r => r.ReplaceShiftTemplatesAsync(
            id,
            It.Is<IEnumerable<ClinicShiftTemplate>>(t => t.Count() == 3)
        ), Times.Once);
    }

    [Fact]
    public async Task UpsertShiftTemplatesAsync_MapsProfessionalTypeCorrectly()
    {
        var id = Guid.NewGuid();
        IEnumerable<ClinicShiftTemplate>? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.ReplaceShiftTemplatesAsync(id, It.IsAny<IEnumerable<ClinicShiftTemplate>>()))
             .Callback<Guid, IEnumerable<ClinicShiftTemplate>>((_, t) => captured = t)
             .Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var request = new UpsertShiftTemplatesRequest
        {
            Templates = new List<ShiftTemplateItem>
            {
                new ShiftTemplateItem { Name = "Manhã", StartTime = "07:00:00", EndTime = "19:00:00", RequiredStaff = 4, DisplayOrder = 1, ProfessionalType = 1 },
                new ShiftTemplateItem { Name = "Enf", StartTime = "07:00:00", EndTime = "19:00:00", RequiredStaff = 2, DisplayOrder = 1, ProfessionalType = 2 },
            }
        };

        await CreateService().UpsertShiftTemplatesAsync(id, request);

        captured.Should().NotBeNull();
        captured!.First(t => t.Name == "Manhã").ProfessionalType.Should().Be(ProfessionalType.Medico);
        captured!.First(t => t.Name == "Enf").ProfessionalType.Should().Be(ProfessionalType.Enfermeiro);
    }

    [Fact]
    public async Task UpsertShiftTemplatesAsync_ParsesTimespansCorrectly()
    {
        var id = Guid.NewGuid();
        IEnumerable<ClinicShiftTemplate>? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.ReplaceShiftTemplatesAsync(id, It.IsAny<IEnumerable<ClinicShiftTemplate>>()))
             .Callback<Guid, IEnumerable<ClinicShiftTemplate>>((_, t) => captured = t)
             .Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var request = new UpsertShiftTemplatesRequest
        {
            Templates = new List<ShiftTemplateItem>
            {
                new ShiftTemplateItem { Name = "Tarde", StartTime = "13:00:00", EndTime = "01:00:00", RequiredStaff = 3, DisplayOrder = 1, ProfessionalType = 1 },
            }
        };

        await CreateService().UpsertShiftTemplatesAsync(id, request);

        captured!.First().StartTime.Should().Be(TimeSpan.Parse("13:00:00"));
        captured!.First().EndTime.Should().Be(TimeSpan.Parse("01:00:00"));
    }

    [Fact]
    public async Task UpsertShiftTemplatesAsync_DefaultsRequiredStaffToOneWhenZero()
    {
        var id = Guid.NewGuid();
        IEnumerable<ClinicShiftTemplate>? captured = null;
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.ReplaceShiftTemplatesAsync(id, It.IsAny<IEnumerable<ClinicShiftTemplate>>()))
             .Callback<Guid, IEnumerable<ClinicShiftTemplate>>((_, t) => captured = t)
             .Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var request = new UpsertShiftTemplatesRequest
        {
            Templates = new List<ShiftTemplateItem>
            {
                new ShiftTemplateItem { Name = "Manhã", StartTime = "07:00:00", EndTime = "19:00:00", RequiredStaff = 0, DisplayOrder = 1, ProfessionalType = 1 },
            }
        };

        await CreateService().UpsertShiftTemplatesAsync(id, request);

        captured!.First().RequiredStaff.Should().Be(1);
    }

    [Fact]
    public async Task UpsertShiftTemplatesAsync_EmptyList_StillCallsReplace()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.ReplaceShiftTemplatesAsync(id, It.IsAny<IEnumerable<ClinicShiftTemplate>>()))
             .Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await CreateService().UpsertShiftTemplatesAsync(id, new UpsertShiftTemplatesRequest { Templates = new List<ShiftTemplateItem>() });

        _repo.Verify(r => r.ReplaceShiftTemplatesAsync(id, It.IsAny<IEnumerable<ClinicShiftTemplate>>()), Times.Once);
    }

    [Fact]
    public async Task UpsertShiftTemplatesAsync_InvalidatesCacheAfterReplace()
    {
        var id = Guid.NewGuid();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _repo.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(MakeClinic(id));
        _repo.Setup(r => r.ReplaceShiftTemplatesAsync(id, It.IsAny<IEnumerable<ClinicShiftTemplate>>()))
             .Returns(Task.CompletedTask);
        _cache.Setup(c => c.RemoveByPrefixAsync("clinics:", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await CreateService().UpsertShiftTemplatesAsync(id, new UpsertShiftTemplatesRequest());

        _cache.Verify(c => c.RemoveByPrefixAsync("clinics:", It.IsAny<CancellationToken>()), Times.Once);
    }
}
