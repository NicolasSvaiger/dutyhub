using Moq;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.PropertyTests.Prefeitura;

/// <summary>
/// Helpers compartilhados pelos property tests do <c>PrefeituraService</c>.
/// Setup mínimo — cada propriedade pode customizar campos específicos.
/// Um <see cref="PassthroughCache"/> local evita mockar semântica de cache
/// (todo Get faz miss e chama a factory, então a lógica de agregação real
/// é sempre exercitada).
/// </summary>
internal static class PrefeituraPropertyHelpers
{
    /// <summary>Cache pass-through — factory sempre invocada.</summary>
    internal sealed class PassthroughCache : ICacheService
    {
        public async Task<T?> GetOrSetAsync<T>(string key, Func<Task<T>> factory, TimeSpan? ttl = null, CancellationToken ct = default)
            => await factory();
        public Task<T?> GetAsync<T>(string key, CancellationToken ct = default) => Task.FromResult<T?>(default);
        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default) => Task.CompletedTask;
        public Task RemoveAsync(string key, CancellationToken ct = default) => Task.CompletedTask;
        public Task RemoveByPrefixAsync(string prefix, CancellationToken ct = default) => Task.CompletedTask;
    }

    /// <summary>Monta um service com mocks base (todos retornando vazio).</summary>
    internal static PrefeituraService BuildService(
        Guid organId,
        IEnumerable<Guid> descendantIds,
        IEnumerable<Guid> clinicIds,
        Action<PrefeituraServiceMocks>? customize = null)
    {
        var mocks = new PrefeituraServiceMocks();
        mocks.TenantService.Setup(t => t.GetCurrentPublicOrganId()).Returns(organId);
        mocks.OrganRepo.Setup(r => r.GetDescendantIdsAsync(organId, It.IsAny<CancellationToken>()))
                       .ReturnsAsync(descendantIds);
        mocks.ContractRepo.Setup(r => r.GetActiveClinicIdsByOrganIdsAsync(
                            It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()))
                         .ReturnsAsync(clinicIds);
        mocks.SettingsRepo.Setup(s => s.GetAsync()).ReturnsAsync(new SystemSettings
        {
            Id = SystemSettings.SingletonId,
            CheckInToleranceMinutes = 15,
            AbsenceThresholdMinutes = 60,
        });
        customize?.Invoke(mocks);

        return new PrefeituraService(
            mocks.TenantService.Object, mocks.Cache,
            mocks.OrganRepo.Object, mocks.ContractRepo.Object,
            mocks.ClinicRepo.Object, mocks.ShiftRepo.Object,
            mocks.AttendanceRepo.Object, mocks.SubstitutionRepo.Object,
            mocks.JustificationRepo.Object, mocks.AlertRepo.Object,
            mocks.SettingsRepo.Object, mocks.AlertService.Object);
    }

    internal class PrefeituraServiceMocks
    {
        public Mock<ITenantService> TenantService { get; } = new();
        public Mock<IPublicOrganRepository> OrganRepo { get; } = new();
        public Mock<IContractRepository> ContractRepo { get; } = new();
        public Mock<IClinicRepository> ClinicRepo { get; } = new();
        public Mock<IShiftRepository> ShiftRepo { get; } = new();
        public Mock<IAttendanceRepository> AttendanceRepo { get; } = new();
        public Mock<ISubstitutionRepository> SubstitutionRepo { get; } = new();
        public Mock<IJustificationRepository> JustificationRepo { get; } = new();
        public Mock<IAlertRepository> AlertRepo { get; } = new();
        public Mock<ISettingsRepository> SettingsRepo { get; } = new();
        public Mock<IAlertService> AlertService { get; } = new();
        public PassthroughCache Cache { get; } = new();
    }
}
