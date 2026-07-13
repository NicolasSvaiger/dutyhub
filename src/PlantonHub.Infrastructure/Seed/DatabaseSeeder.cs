using Microsoft.EntityFrameworkCore;
using PlantonHub.Application.Interfaces;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Infrastructure.Data;

namespace PlantonHub.Infrastructure.Seed;

public class DatabaseSeeder
{
    private readonly AppDbContext _context;
    private readonly IPasswordHashService _passwordHashService;

    // Fixed GUIDs for seed data (referenceable in tests)
    private static readonly Guid AdminUserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid MedicoUserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid EnfermeiroUserId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid AdminClinicaUserId = Guid.Parse("44444444-4444-4444-4444-444444444444");
    private static readonly Guid ClinicAlphaId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid ClinicBetaId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    // Public organs & contracts
    private static readonly Guid PublicOrganSantoAndreId = Guid.Parse("dddddddd-0001-0001-0001-000000000001");
    private static readonly Guid PublicOrganDiademaId   = Guid.Parse("dddddddd-0002-0002-0002-000000000002");
    private static readonly Guid SubPrefCentroId        = Guid.Parse("dddddddd-0003-0003-0003-000000000003");
    private static readonly Guid ContractSantoAndreId   = Guid.Parse("eeeeeeee-0001-0001-0001-000000000001");
    private static readonly Guid ContractDiademaId      = Guid.Parse("eeeeeeee-0002-0002-0002-000000000002");

    // Default walk-in shifts (one per clinic) so the medico can always check in
    private static readonly Guid ShiftAlphaId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccc01");
    private static readonly Guid ShiftBetaId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccc02");

    public DatabaseSeeder(AppDbContext context, IPasswordHashService passwordHashService)
    {
        _context = context;
        _passwordHashService = passwordHashService;
    }

    public async Task SeedAsync()
    {
        // Idempotency check: skip if users already exist
        if (await _context.Users.AnyAsync(u => u.Email == "admin@plantonhub.com"))
        {
            // Even if base seed was done, ensure PublicOrgan/Contract seed is applied
            await SeedPublicOrgansAndContractsAsync();
            return;
        }

        var now = DateTime.UtcNow;

        // Seed Users
        var adminUser = new User
        {
            Id = AdminUserId,
            Email = "admin@plantonhub.com",
            Name = "Admin Global",
            PasswordHash = _passwordHashService.HashPassword("Admin@123"),
            CreatedAt = now,
            UpdatedAt = now
        };

        var medicoUser = new User
        {
            Id = MedicoUserId,
            Email = "medico@plantonhub.com",
            Name = "Dr. Médico Teste",
            PasswordHash = _passwordHashService.HashPassword("Teste@123"),
            CreatedAt = now,
            UpdatedAt = now,
            ProfessionalType = ProfessionalType.Medico,
            IsActive = true,
            RegistrationNumber = "CRM12345",
            Specialty = "Clínica Geral"
        };

        var enfermeiroUser = new User
        {
            Id = EnfermeiroUserId,
            Email = "enfermeiro@plantonhub.com",
            Name = "Enfermeiro Teste",
            PasswordHash = _passwordHashService.HashPassword("Teste@123"),
            CreatedAt = now,
            UpdatedAt = now,
            ProfessionalType = ProfessionalType.Enfermeiro,
            IsActive = true,
            RegistrationNumber = "COREN54321"
        };

        var adminClinicaUser = new User
        {
            Id = AdminClinicaUserId,
            Email = "adminclinica@plantonhub.com",
            Name = "Admin Clínica Teste",
            PasswordHash = _passwordHashService.HashPassword("Teste@123"),
            CreatedAt = now,
            UpdatedAt = now
        };

        _context.Users.AddRange(adminUser, medicoUser, enfermeiroUser, adminClinicaUser);

        // Seed Clinics
        var clinicAlpha = new Clinic
        {
            Id = ClinicAlphaId,
            Name = "Clínica Alpha",
            Address = "Rua Alpha, 100",
            Phone = "11999990001",
            IsActive = true,
            CreatedAt = now
        };

        var clinicBeta = new Clinic
        {
            Id = ClinicBetaId,
            Name = "Clínica Beta",
            Address = "Rua Beta, 200",
            Phone = "11999990002",
            IsActive = true,
            CreatedAt = now
        };

        _context.Clinics.AddRange(clinicAlpha, clinicBeta);

        // Seed Shift Templates para Clínica Alpha (com enfermagem - 3 turnos médico + 2 enfermeiro)
        clinicAlpha.HasNursing = true;
        var templatesAlpha = new List<ClinicShiftTemplate>
        {
            new ClinicShiftTemplate { Id = Guid.NewGuid(), ClinicId = ClinicAlphaId, Name = "Manhã", StartTime = new TimeSpan(7, 0, 0), EndTime = new TimeSpan(13, 0, 0), RequiredStaff = 2, DisplayOrder = 1, ProfessionalType = ProfessionalType.Medico },
            new ClinicShiftTemplate { Id = Guid.NewGuid(), ClinicId = ClinicAlphaId, Name = "Tarde", StartTime = new TimeSpan(13, 0, 0), EndTime = new TimeSpan(19, 0, 0), RequiredStaff = 2, DisplayOrder = 2, ProfessionalType = ProfessionalType.Medico },
            new ClinicShiftTemplate { Id = Guid.NewGuid(), ClinicId = ClinicAlphaId, Name = "Noite", StartTime = new TimeSpan(19, 0, 0), EndTime = new TimeSpan(7, 0, 0), RequiredStaff = 2, DisplayOrder = 3, ProfessionalType = ProfessionalType.Medico },
            new ClinicShiftTemplate { Id = Guid.NewGuid(), ClinicId = ClinicAlphaId, Name = "Manhã", StartTime = new TimeSpan(7, 0, 0), EndTime = new TimeSpan(19, 0, 0), RequiredStaff = 1, DisplayOrder = 1, ProfessionalType = ProfessionalType.Enfermeiro },
            new ClinicShiftTemplate { Id = Guid.NewGuid(), ClinicId = ClinicAlphaId, Name = "Noite", StartTime = new TimeSpan(19, 0, 0), EndTime = new TimeSpan(7, 0, 0), RequiredStaff = 1, DisplayOrder = 2, ProfessionalType = ProfessionalType.Enfermeiro },
        };
        _context.ClinicShiftTemplates.AddRange(templatesAlpha);

        // Seed Shift Templates para Clínica Beta (sem enfermagem - 2 turnos médico)
        var templatesBeta = new List<ClinicShiftTemplate>
        {
            new ClinicShiftTemplate { Id = Guid.NewGuid(), ClinicId = ClinicBetaId, Name = "Manhã", StartTime = new TimeSpan(7, 0, 0), EndTime = new TimeSpan(19, 0, 0), RequiredStaff = 3, DisplayOrder = 1, ProfessionalType = ProfessionalType.Medico },
            new ClinicShiftTemplate { Id = Guid.NewGuid(), ClinicId = ClinicBetaId, Name = "Noite", StartTime = new TimeSpan(19, 0, 0), EndTime = new TimeSpan(7, 0, 0), RequiredStaff = 2, DisplayOrder = 2, ProfessionalType = ProfessionalType.Medico },
        };
        _context.ClinicShiftTemplates.AddRange(templatesBeta);

        // Seed UserClinicRole associations (all in Clínica Alpha)
        var roles = new List<UserClinicRole>
        {
            new UserClinicRole
            {
                Id = Guid.NewGuid(),
                UserId = AdminUserId,
                ClinicId = ClinicAlphaId,
                Role = RoleType.AdminGlobal,
                AssignedAt = now
            },
            new UserClinicRole
            {
                Id = Guid.NewGuid(),
                UserId = AdminClinicaUserId,
                ClinicId = ClinicAlphaId,
                Role = RoleType.AdminClinica,
                AssignedAt = now
            },
            new UserClinicRole
            {
                Id = Guid.NewGuid(),
                UserId = MedicoUserId,
                ClinicId = ClinicAlphaId,
                Role = RoleType.Medico,
                AssignedAt = now
            },
            // Multi-clinic scenario: same doctor also works at Clínica Beta
            new UserClinicRole
            {
                Id = Guid.NewGuid(),
                UserId = MedicoUserId,
                ClinicId = ClinicBetaId,
                Role = RoleType.Medico,
                AssignedAt = now
            },
            new UserClinicRole
            {
                Id = Guid.NewGuid(),
                UserId = EnfermeiroUserId,
                ClinicId = ClinicAlphaId,
                Role = RoleType.Enfermeiro,
                AssignedAt = now
            }
        };

        _context.UserClinicRoles.AddRange(roles);

        // Seed a "walk-in" shift per clinic so professionals can check in without
        // needing an admin to schedule one first (dev convenience).
        var today = now.Date;
        var shifts = new List<Shift>
        {
            new Shift
            {
                Id = ShiftAlphaId,
                ClinicId = ClinicAlphaId,
                Title = "Plantão Livre - Alpha",
                Date = today,
                StartTime = TimeSpan.Zero,          // 00:00
                EndTime = new TimeSpan(23, 59, 59), // 23:59:59
                CreatedAt = now
            },
            new Shift
            {
                Id = ShiftBetaId,
                ClinicId = ClinicBetaId,
                Title = "Plantão Livre - Beta",
                Date = today,
                StartTime = TimeSpan.Zero,
                EndTime = new TimeSpan(23, 59, 59),
                CreatedAt = now
            }
        };

        _context.Shifts.AddRange(shifts);

        // Assign the medico to both walk-in shifts (multi-clinic scenario)
        var assignments = new List<ShiftAssignment>
        {
            new ShiftAssignment
            {
                Id = Guid.NewGuid(),
                ShiftId = ShiftAlphaId,
                UserId = MedicoUserId,
                AssignedAt = now
            },
            new ShiftAssignment
            {
                Id = Guid.NewGuid(),
                ShiftId = ShiftBetaId,
                UserId = MedicoUserId,
                AssignedAt = now
            }
        };

        _context.ShiftAssignments.AddRange(assignments);

        // ── Histórico de plantões passados (para popular relatórios em dev) ──
        // Gera ~20 plantões completos (check-in + check-out) para o médico teste
        // nos últimos 30 dias, alternando entre Alpha e Beta. Datas e horas com
        // pequena variância para os relatórios ficarem realistas.
        var rand = new Random(42); // seed fixo → histórico determinístico entre reseeds
        var historyShifts = new List<Shift>();
        var historyAssignments = new List<ShiftAssignment>();
        var historyAttendances = new List<Attendance>();

        // Padrões de plantão que vamos rotacionar:
        //   dayShift    → 08:00 → 18:00 (10h)
        //   nightShift  → 19:00 → 06:00 do dia seguinte (11h)
        //   shortShift  → 13:00 → 17:00 (4h)
        var patterns = new[]
        {
            (Title: "Plantão Diurno",   Start: new TimeSpan(8, 0, 0),  End: new TimeSpan(18, 0, 0), IsOvernight: false),
            (Title: "Plantão Noturno",  Start: new TimeSpan(19, 0, 0), End: new TimeSpan(6, 0, 0),  IsOvernight: true),
            (Title: "Plantão da Tarde", Start: new TimeSpan(13, 0, 0), End: new TimeSpan(17, 0, 0), IsOvernight: false),
        };

        for (int i = 1; i <= 20; i++)
        {
            var shiftDate = today.AddDays(-i);
            // Alterna clínicas com um viés leve pra Alpha ter mais registros
            var isBeta = i % 3 == 0;
            var clinicId = isBeta ? ClinicBetaId : ClinicAlphaId;
            var pattern = patterns[i % patterns.Length];

            var shiftId = Guid.NewGuid();
            historyShifts.Add(new Shift
            {
                Id = shiftId,
                ClinicId = clinicId,
                Title = pattern.Title,
                Date = shiftDate,
                StartTime = pattern.Start,
                EndTime = pattern.End,
                CreatedAt = shiftDate,
            });

            historyAssignments.Add(new ShiftAssignment
            {
                Id = Guid.NewGuid(),
                ShiftId = shiftId,
                UserId = MedicoUserId,
                AssignedAt = shiftDate,
            });

            // Horário de check-in com jitter de -10 a +15 minutos
            var checkInUtc = shiftDate
                .Add(pattern.Start)
                .AddMinutes(rand.Next(-10, 16))
                .ToUniversalTime();

            // Horário de check-out (soma um dia se plantão vira a noite)
            var checkOutBase = pattern.IsOvernight
                ? shiftDate.AddDays(1).Add(pattern.End)
                : shiftDate.Add(pattern.End);
            var checkOutUtc = checkOutBase
                .AddMinutes(rand.Next(-15, 31))
                .ToUniversalTime();

            historyAttendances.Add(new Attendance
            {
                Id = Guid.NewGuid(),
                UserId = MedicoUserId,
                ShiftId = shiftId,
                ClinicId = clinicId,
                CheckInTime = checkInUtc,
                CheckInLatitude = -23.5505 + rand.NextDouble() * 0.01,
                CheckInLongitude = -46.6333 + rand.NextDouble() * 0.01,
                CheckInDeviceId = "seed-device-01",
                BiometricValidated = true,
                CheckOutTime = checkOutUtc,
                CheckOutLatitude = -23.5505 + rand.NextDouble() * 0.01,
                CheckOutLongitude = -46.6333 + rand.NextDouble() * 0.01,
                CheckOutDeviceId = "seed-device-01",
                SyncSource = Domain.Enums.SyncSource.Online,
                SyncStatus = Domain.Enums.SyncStatus.OnlineSynced,
            });
        }

        _context.Shifts.AddRange(historyShifts);
        _context.ShiftAssignments.AddRange(historyAssignments);
        _context.Attendances.AddRange(historyAttendances);

        // ── Plantões futuros (próximos ~30 dias) ─────────────────────────
        // O médico teste precisa ver algo no bucket "Próximos" da tela de
        // plantões. Geramos 8 plantões espaçados alternando clínicas.
        var futureShifts = new List<Shift>();
        var futureAssignments = new List<ShiftAssignment>();

        for (int i = 1; i <= 8; i++)
        {
            // Espaça: dia +2, +4, +6, +9, +12, +16, +21, +28
            var offsets = new[] { 2, 4, 6, 9, 12, 16, 21, 28 };
            var shiftDate = today.AddDays(offsets[i - 1]);
            var isBeta = i % 3 == 0;
            var clinicId = isBeta ? ClinicBetaId : ClinicAlphaId;
            var pattern = patterns[i % patterns.Length];

            var shiftId = Guid.NewGuid();
            futureShifts.Add(new Shift
            {
                Id = shiftId,
                ClinicId = clinicId,
                Title = pattern.Title,
                Date = shiftDate,
                StartTime = pattern.Start,
                EndTime = pattern.End,
                CreatedAt = now,
            });

            futureAssignments.Add(new ShiftAssignment
            {
                Id = Guid.NewGuid(),
                ShiftId = shiftId,
                UserId = MedicoUserId,
                AssignedAt = now,
            });
        }

        _context.Shifts.AddRange(futureShifts);
        _context.ShiftAssignments.AddRange(futureAssignments);

        await _context.SaveChangesAsync();

        await SeedPublicOrgansAndContractsAsync();
    }

    private async Task SeedPublicOrgansAndContractsAsync()
    {
        var now = DateTime.UtcNow;

        // Idempotency: skip if already seeded
        if (await _context.PublicOrgans.AnyAsync(p => p.Id == PublicOrganSantoAndreId))
            return;

        // ── Órgãos Públicos ───────────────────────────────────────────────
        // Duas prefeituras + uma subprefeitura filha de Santo André.
        var publicOrganSantoAndre = new PublicOrgan
        {
            Id = PublicOrganSantoAndreId,
            Name = "Prefeitura Municipal de Santo André",
            Acronym = "PMSA",
            Cnpj = "44374675000108",
            Department = "Secretaria Municipal de Saúde",
            City = "Santo André",
            State = "SP",
            ContactName = "Sileide G. Rocha",
            ContactEmail = "saude@santoandre.sp.gov.br",
            ContactPhone = "1144690000",
            IsActive = true,
            CreatedAt = now,
        };

        var publicOrganDiadema = new PublicOrgan
        {
            Id = PublicOrganDiademaId,
            Name = "Prefeitura Municipal de Diadema",
            Acronym = "PMD",
            Cnpj = "46522959000174",
            Department = "Departamento de Saúde Pública",
            City = "Diadema",
            State = "SP",
            ContactName = "Carlos Eduardo Lima",
            ContactEmail = "saude@diadema.sp.gov.br",
            ContactPhone = "1140577000",
            IsActive = true,
            CreatedAt = now,
        };

        // Subprefeitura filha de Santo André (para demonstrar hierarquia)
        var subPrefCentro = new PublicOrgan
        {
            Id = SubPrefCentroId,
            Name = "Subprefeitura Centro – Santo André",
            Acronym = "SP-CENTRO",
            Department = "Supervisão de Saúde da Região Central",
            City = "Santo André",
            State = "SP",
            ContactName = "Valmir Correia Sousa",
            ContactEmail = "sp.centro@santoandre.sp.gov.br",
            IsActive = true,
            ParentId = PublicOrganSantoAndreId,
            CreatedAt = now,
        };

        _context.PublicOrgans.AddRange(publicOrganSantoAndre, publicOrganDiadema, subPrefCentro);

        // ── Contratos ─────────────────────────────────────────────────────
        var contractSantoAndre = new Contract
        {
            Id = ContractSantoAndreId,
            ContractNumber = "CT-2024-0087",
            PublicOrganId = PublicOrganSantoAndreId,
            MonthlyValue = 220_000m,
            StartDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            EndDate = new DateTime(2026, 12, 31, 23, 59, 59, DateTimeKind.Utc),
            MinSlaPercent = 90,
            Status = Domain.Enums.ContractStatus.Active,
            Notes = "Contrato de gestão de UPAs – vigência bienal.",
            CreatedAt = now,
        };

        var contractDiadema = new Contract
        {
            Id = ContractDiademaId,
            ContractNumber = "CT-2023-0142",
            PublicOrganId = PublicOrganDiademaId,
            MonthlyValue = 160_000m,
            StartDate = new DateTime(2023, 7, 1, 0, 0, 0, DateTimeKind.Utc),
            EndDate = new DateTime(2025, 6, 30, 23, 59, 59, DateTimeKind.Utc),
            MinSlaPercent = 85,
            Status = Domain.Enums.ContractStatus.Renewal,
            Notes = "Em processo de renovação – vence em 45 dias.",
            CreatedAt = now,
        };

        _context.Contracts.AddRange(contractSantoAndre, contractDiadema);
        await _context.SaveChangesAsync();

        // Vincular clínicas aos contratos (atualizar ContractId nas clínicas)
        // Use ExecuteUpdate to avoid change-tracker issues
        await _context.Clinics
            .Where(c => c.Id == ClinicAlphaId && c.ContractId == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.ContractId, ContractSantoAndreId));

        await _context.Clinics
            .Where(c => c.Id == ClinicBetaId && c.ContractId == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.ContractId, ContractDiademaId));
    }
}
