using FluentAssertions;
using Moq;
using PlantonHub.Application.DTOs.Contracts;
using PlantonHub.Application.Exceptions;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Domain.Interfaces;

namespace PlantonHub.UnitTests.Services;

public class ContractServiceTests
{
    private readonly Mock<IContractRepository> _contractRepo = new();
    private readonly Mock<IPublicOrganRepository> _organRepo = new();
    private readonly Mock<ITenantService> _tenant = new();

    private ContractService CreateService() =>
        new(_contractRepo.Object, _organRepo.Object, _tenant.Object);

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static PublicOrgan MakeOrgan(Guid? id = null) => new()
    {
        Id = id ?? Guid.NewGuid(),
        Name = "Prefeitura Teste",
        Acronym = "PMT",
        IsActive = true,
        CreatedAt = DateTime.UtcNow,
    };

    private static Contract MakeContract(Guid? id = null, Guid? organId = null) => new()
    {
        Id = id ?? Guid.NewGuid(),
        ContractNumber = "CT-2025-0001",
        PublicOrganId = organId ?? Guid.NewGuid(),
        PublicOrgan = MakeOrgan(organId),
        MonthlyValue = 100_000m,
        StartDate = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        EndDate = new DateTime(2027, 12, 31, 0, 0, 0, DateTimeKind.Utc),
        MinSlaPercent = 90,
        Status = ContractStatus.Active,
        Notes = null,
        CreatedAt = DateTime.UtcNow,
        Clinics = new List<Clinic>(),
    };

    private static CreateContractRequest MakeCreateRequest() => new()
    {
        OrganName = "Prefeitura Teste",
        OrganAcronym = "PMT",
        OrganCnpj = null,
        OrganDepartment = null,
        OrganContactName = null,
        OrganContactEmail = null,
        OrganContactPhone = null,
        OrganCity = "Santo André",
        OrganState = "SP",
        ContractNumber = "CT-2025-0001",
        MonthlyValue = 100_000m,
        StartDate = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        EndDate = new DateTime(2027, 12, 31, 0, 0, 0, DateTimeKind.Utc),
        MinSlaPercent = 90,
        Status = ContractStatus.Active,
        Notes = null,
    };

    // ── GetAllAsync ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAllAsync_AdminGlobal_ReturnsAll()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        var contracts = new[] { MakeContract(), MakeContract() };
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(contracts);

        var result = await CreateService().GetAllAsync();

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetAllAsync_AdminClinica_NoAuthorizedClinics_ReturnsEmpty()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(Enumerable.Empty<Guid>());

        var result = await CreateService().GetAllAsync();

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetAllAsync_AdminClinica_ReturnsOnlyAuthorizedContracts()
    {
        var clinicId = Guid.NewGuid();
        var contractId = Guid.NewGuid();

        var contract = MakeContract(contractId);
        contract.Clinics = new List<Clinic>
        {
            new Clinic { Id = clinicId, Name = "UPA Alpha", IsActive = true },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId });
        _contractRepo.Setup(r => r.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
            .ReturnsAsync(new[] { contract });

        var result = await CreateService().GetAllAsync();

        result.Should().HaveCount(1);
        result.First().Id.Should().Be(contractId);
    }

    [Fact]
    public async Task GetAllAsync_AdminClinica_ClinicsFilteredToAuthorizedOnly()
    {
        var clinicId1 = Guid.NewGuid();
        var clinicId2 = Guid.NewGuid(); // unauthorized

        var contract = MakeContract();
        contract.Clinics = new List<Clinic>
        {
            new Clinic { Id = clinicId1, Name = "UPA Alpha", IsActive = true },
            new Clinic { Id = clinicId2, Name = "UPA Beta", IsActive = true },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId1 });
        _contractRepo.Setup(r => r.GetByClinicIdsAsync(It.IsAny<IEnumerable<Guid>>()))
            .ReturnsAsync(new[] { contract });

        var result = await CreateService().GetAllAsync();

        // AdminClinica should only see their own clinic in the contract response
        result.First().Clinics.Should().HaveCount(1);
        result.First().Clinics.First().Name.Should().Be("UPA Alpha");
    }

    [Fact]
    public async Task GetAllAsync_AdminGlobal_ClinicsNotFiltered()
    {
        var contract = MakeContract();
        contract.Clinics = new List<Clinic>
        {
            new Clinic { Id = Guid.NewGuid(), Name = "UPA Alpha", IsActive = true },
            new Clinic { Id = Guid.NewGuid(), Name = "UPA Beta", IsActive = true },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { contract });

        var result = await CreateService().GetAllAsync();

        // AdminGlobal sees all clinics
        result.First().Clinics.Should().HaveCount(2);
    }

    // ── GetByIdAsync ──────────────────────────────────────────────────────────

    [Fact]
    public async Task GetByIdAsync_NotFound_ReturnsNull()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _contractRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Contract?)null);

        var result = await CreateService().GetByIdAsync(Guid.NewGuid());

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetByIdAsync_AdminGlobal_ReturnsContract()
    {
        var contract = MakeContract();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _contractRepo.Setup(r => r.GetByIdAsync(contract.Id)).ReturnsAsync(contract);

        var result = await CreateService().GetByIdAsync(contract.Id);

        result.Should().NotBeNull();
        result!.Id.Should().Be(contract.Id);
    }

    [Fact]
    public async Task GetByIdAsync_AdminClinica_NoAccess_ReturnsNull()
    {
        var clinicId = Guid.NewGuid();
        var contract = MakeContract();
        contract.Clinics = new List<Clinic>
        {
            new Clinic { Id = Guid.NewGuid(), Name = "UPA Outra", IsActive = true },
        };

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);
        _tenant.Setup(t => t.GetAuthorizedClinicIds()).Returns(new[] { clinicId }); // different clinic
        _contractRepo.Setup(r => r.GetByIdAsync(contract.Id)).ReturnsAsync(contract);

        var result = await CreateService().GetByIdAsync(contract.Id);

        result.Should().BeNull();
    }

    // ── CreateAsync ───────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateAsync_NonAdmin_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);

        var act = () => CreateService().CreateAsync(MakeCreateRequest());

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task CreateAsync_AdminGlobal_CreatesOrganAndContract()
    {
        var organId = Guid.NewGuid();
        var contractId = Guid.NewGuid();
        var createdContract = MakeContract(contractId, organId);

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _organRepo.Setup(r => r.AddAsync(It.IsAny<PublicOrgan>())).Returns(Task.CompletedTask);
        _contractRepo.Setup(r => r.AddAsync(It.IsAny<Contract>())).Returns(Task.CompletedTask);
        _contractRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync(createdContract);

        var result = await CreateService().CreateAsync(MakeCreateRequest());

        _organRepo.Verify(r => r.AddAsync(It.Is<PublicOrgan>(o =>
            o.Name == "Prefeitura Teste" && o.Acronym == "PMT"
        )), Times.Once);
        _contractRepo.Verify(r => r.AddAsync(It.Is<Contract>(c =>
            c.ContractNumber == "CT-2025-0001" && c.MonthlyValue == 100_000m
        )), Times.Once);

        result.ContractNumber.Should().Be("CT-2025-0001");
    }

    [Fact]
    public async Task CreateAsync_SetsCorrectUtcDates()
    {
        var createdContract = MakeContract();
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _organRepo.Setup(r => r.AddAsync(It.IsAny<PublicOrgan>())).Returns(Task.CompletedTask);
        _contractRepo.Setup(r => r.AddAsync(It.IsAny<Contract>())).Returns(Task.CompletedTask);
        _contractRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync(createdContract);

        Contract? captured = null;
        _contractRepo.Setup(r => r.AddAsync(It.IsAny<Contract>()))
            .Callback<Contract>(c => captured = c)
            .Returns(Task.CompletedTask);

        var req = MakeCreateRequest();
        req.StartDate = new DateTime(2025, 6, 1, 0, 0, 0, DateTimeKind.Unspecified);
        req.EndDate = new DateTime(2027, 5, 31, 0, 0, 0, DateTimeKind.Unspecified);

        await CreateService().CreateAsync(req);

        captured.Should().NotBeNull();
        captured!.StartDate.Kind.Should().Be(DateTimeKind.Utc);
        captured!.EndDate.Kind.Should().Be(DateTimeKind.Utc);
    }

    // ── UpdateAsync ───────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_NonAdmin_ThrowsForbidden()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(false);

        var act = () => CreateService().UpdateAsync(Guid.NewGuid(), new UpdateContractRequest
        {
            OrganName = "X", ContractNumber = "CT-X",
            StartDate = DateTime.UtcNow, EndDate = DateTime.UtcNow.AddYears(1),
        });

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task UpdateAsync_ContractNotFound_ThrowsNotFound()
    {
        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _contractRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Contract?)null);

        var act = () => CreateService().UpdateAsync(Guid.NewGuid(), new UpdateContractRequest
        {
            OrganName = "X", ContractNumber = "CT-X",
            StartDate = DateTime.UtcNow, EndDate = DateTime.UtcNow.AddYears(1),
        });

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task UpdateAsync_UpdatesContractAndOrganFields()
    {
        var contractId = Guid.NewGuid();
        var organId = Guid.NewGuid();
        var contract = MakeContract(contractId, organId);
        var updatedContract = MakeContract(contractId, organId);
        updatedContract.ContractNumber = "CT-2025-UPDATED";
        updatedContract.PublicOrgan!.Name = "Prefeitura Atualizada";

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _contractRepo.Setup(r => r.GetByIdAsync(contractId)).ReturnsAsync(contract);
        _contractRepo.Setup(r => r.UpdateAsync(It.IsAny<Contract>())).Returns(Task.CompletedTask);
        _contractRepo.Setup(r => r.GetByIdAsync(contractId)).ReturnsAsync(updatedContract);

        var result = await CreateService().UpdateAsync(contractId, new UpdateContractRequest
        {
            OrganName = "Prefeitura Atualizada",
            OrganAcronym = "PA",
            ContractNumber = "CT-2025-UPDATED",
            MonthlyValue = 200_000m,
            StartDate = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            EndDate = new DateTime(2028, 12, 31, 0, 0, 0, DateTimeKind.Utc),
            Status = ContractStatus.Active,
        });

        result.ContractNumber.Should().Be("CT-2025-UPDATED");
        result.PublicOrganName.Should().Be("Prefeitura Atualizada");
    }

    [Fact]
    public async Task UpdateAsync_SetsUtcKindOnDates()
    {
        var contractId = Guid.NewGuid();
        var contract = MakeContract(contractId);
        Contract? capturedUpdate = null;

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _contractRepo.Setup(r => r.GetByIdAsync(contractId)).ReturnsAsync(contract);
        _contractRepo.Setup(r => r.UpdateAsync(It.IsAny<Contract>()))
            .Callback<Contract>(c => capturedUpdate = c)
            .Returns(Task.CompletedTask);
        _contractRepo.Setup(r => r.GetByIdAsync(contractId))
            .ReturnsAsync(contract);

        await CreateService().UpdateAsync(contractId, new UpdateContractRequest
        {
            OrganName = "Pref",
            ContractNumber = "CT-X",
            StartDate = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Unspecified),
            EndDate = new DateTime(2027, 12, 31, 0, 0, 0, DateTimeKind.Unspecified),
            Status = ContractStatus.Active,
        });

        capturedUpdate.Should().NotBeNull();
        capturedUpdate!.StartDate.Kind.Should().Be(DateTimeKind.Utc);
        capturedUpdate!.EndDate.Kind.Should().Be(DateTimeKind.Utc);
    }

    // ── MapToResponse — organ fields ──────────────────────────────────────────

    [Fact]
    public async Task GetAllAsync_AdminGlobal_MapsOrganFieldsToResponse()
    {
        var organ = MakeOrgan();
        organ.Cnpj = "12345678000199";
        organ.City = "Santo André";
        organ.State = "SP";
        organ.ContactEmail = "contato@pref.sp.gov.br";
        organ.Department = "Secretaria de Saúde";

        var contract = MakeContract();
        contract.PublicOrgan = organ;
        contract.PublicOrganId = organ.Id;

        _tenant.Setup(t => t.IsAdminGlobal()).Returns(true);
        _contractRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new[] { contract });

        var result = (await CreateService().GetAllAsync()).First();

        result.PublicOrganCnpj.Should().Be("12345678000199");
        result.PublicOrganCity.Should().Be("Santo André");
        result.PublicOrganState.Should().Be("SP");
        result.PublicOrganContactEmail.Should().Be("contato@pref.sp.gov.br");
        result.PublicOrganDepartment.Should().Be("Secretaria de Saúde");
    }
}
