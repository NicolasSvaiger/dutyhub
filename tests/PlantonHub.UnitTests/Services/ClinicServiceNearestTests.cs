using FluentAssertions;
using Moq;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

public class ClinicServiceNearestTests
{
    private readonly Mock<IClinicRepository> _clinicRepo = new();
    private readonly Mock<ITenantService> _tenant = new();
    private readonly Mock<ICacheService> _cache = new();

    private ClinicService CreateService() => new(_clinicRepo.Object, _tenant.Object, _cache.Object);

    [Fact]
    public async Task GetNearestAsync_NoAuthorizedClinics_ReturnsEmpty()
    {
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Enumerable.Empty<Guid>());
        var service = CreateService();

        var result = await service.GetNearestAsync(-23.55, -46.63);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetNearestAsync_ClinicsWithoutCoordinates_ExcludedFromResults()
    {
        var clinicId = Guid.NewGuid();
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId))
            .ReturnsAsync(new Clinic { Id = clinicId, Name = "No GPS", IsActive = true, Latitude = null, Longitude = null });

        var service = CreateService();
        var result = await service.GetNearestAsync(-23.55, -46.63);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetNearestAsync_ReturnsOrderedByDistance()
    {
        var clinic1 = Guid.NewGuid();
        var clinic2 = Guid.NewGuid();
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinic1, clinic2 });

        // Clinic 1: ~1km away
        _clinicRepo.Setup(r => r.GetByIdAsync(clinic1))
            .ReturnsAsync(new Clinic { Id = clinic1, Name = "Far", IsActive = true, Latitude = -23.56, Longitude = -46.63, AllowedRadiusMeters = 500 });
        // Clinic 2: very close (~100m)
        _clinicRepo.Setup(r => r.GetByIdAsync(clinic2))
            .ReturnsAsync(new Clinic { Id = clinic2, Name = "Near", IsActive = true, Latitude = -23.5501, Longitude = -46.6301, AllowedRadiusMeters = 500 });

        var service = CreateService();
        var result = (await service.GetNearestAsync(-23.55, -46.63)).ToList();

        result.Should().HaveCount(2);
        result[0].Name.Should().Be("Near");
        result[1].Name.Should().Be("Far");
        result[0].DistanceMeters.Should().BeLessThan(result[1].DistanceMeters);
    }

    [Fact]
    public async Task GetNearestAsync_WithinRadius_SetCorrectly()
    {
        var clinicId = Guid.NewGuid();
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        // Clinic at the exact same coordinates
        _clinicRepo.Setup(r => r.GetByIdAsync(clinicId))
            .ReturnsAsync(new Clinic { Id = clinicId, Name = "Here", IsActive = true, Latitude = -23.55, Longitude = -46.63, AllowedRadiusMeters = 500 });

        var service = CreateService();
        var result = (await service.GetNearestAsync(-23.55, -46.63)).ToList();

        result.Should().HaveCount(1);
        result[0].WithinRadius.Should().BeTrue();
        result[0].DistanceMeters.Should().BeLessThan(1); // basically 0
    }

    [Fact]
    public async Task GetNearestAsync_RespectsLimit()
    {
        var ids = Enumerable.Range(0, 10).Select(_ => Guid.NewGuid()).ToList();
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(ids);
        foreach (var id in ids)
        {
            _clinicRepo.Setup(r => r.GetByIdAsync(id))
                .ReturnsAsync(new Clinic { Id = id, Name = $"C-{id}", IsActive = true, Latitude = -23.55 + 0.01 * ids.IndexOf(id), Longitude = -46.63 });
        }

        var service = CreateService();
        var result = await service.GetNearestAsync(-23.55, -46.63, limit: 3);

        result.Count().Should().Be(3);
    }

    [Fact]
    public void HaversineDistance_SamePoint_ReturnsZero()
    {
        var d = ClinicService.HaversineDistance(-23.55, -46.63, -23.55, -46.63);
        d.Should().Be(0);
    }

    [Fact]
    public void HaversineDistance_KnownDistance_ApproximatelyCorrect()
    {
        // São Paulo to Rio: ~358km
        var d = ClinicService.HaversineDistance(-23.5505, -46.6333, -22.9068, -43.1729);
        d.Should().BeInRange(350_000, 370_000);
    }
}
