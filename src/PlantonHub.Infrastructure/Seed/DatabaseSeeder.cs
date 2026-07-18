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
    // Gestor Público — Prefeitura de Santo André (Sprint 7A)
    private static readonly Guid GestorPublicoUserId = Guid.Parse("66666666-6666-6666-6666-666666666666");
    private static readonly Guid GestorPublicoRoleId = Guid.Parse("77777777-7777-7777-7777-777777777777");
    private static readonly Guid ClinicAlphaId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid ClinicBetaId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    // Public organs & contracts
    private static readonly Guid PublicOrganSantoAndreId = Guid.Parse("dddddddd-0001-0001-0001-000000000001");
    private static readonly Guid PublicOrganDiademaId   = Guid.Parse("dddddddd-0002-0002-0002-000000000002");
    private static readonly Guid SubPrefCentroId        = Guid.Parse("dddddddd-0003-0003-0003-000000000003");
    private static readonly Guid ContractSantoAndreId   = Guid.Parse("eeeeeeee-0001-0001-0001-000000000001");
    private static readonly Guid ContractDiademaId      = Guid.Parse("eeeeeeee-0002-0002-0002-000000000002");

    // Extra doctors (used as absent/substitute in Substitution seed)
    private static readonly Guid MedicoRenataId  = Guid.Parse("22222222-2222-2222-2222-222222222aa1");
    private static readonly Guid MedicoJessicaId = Guid.Parse("22222222-2222-2222-2222-222222222aa2");
    private static readonly Guid MedicoRobertoId = Guid.Parse("22222222-2222-2222-2222-222222222aa3");
    private static readonly Guid MedicoMarceloId = Guid.Parse("22222222-2222-2222-2222-222222222aa4");
    private static readonly Guid MedicoCamilaId  = Guid.Parse("22222222-2222-2222-2222-222222222aa5");

    // Substitutions (fixed IDs so re-seed is idempotent)
    private static readonly Guid SubstitutionUrgenteId    = Guid.Parse("ffffffff-0001-0001-0001-000000000001");
    private static readonly Guid SubstitutionPendenteId   = Guid.Parse("ffffffff-0002-0002-0002-000000000002");
    private static readonly Guid SubstitutionConfirmadaId = Guid.Parse("ffffffff-0003-0003-0003-000000000003");
    private static readonly Guid SubstitutionAtestadoId   = Guid.Parse("ffffffff-0004-0004-0004-000000000004");

    // Justifications (fixed IDs so re-seed is idempotent)
    private static readonly Guid JustificationOverdueId    = Guid.Parse("aaaaffff-0001-0001-0001-000000000001");
    private static readonly Guid JustificationPendingId    = Guid.Parse("aaaaffff-0002-0002-0002-000000000002");
    private static readonly Guid JustificationUnderAnalId  = Guid.Parse("aaaaffff-0003-0003-0003-000000000003");
    private static readonly Guid JustificationApprovedId   = Guid.Parse("aaaaffff-0004-0004-0004-000000000004");
    private static readonly Guid JustificationRejectedId   = Guid.Parse("aaaaffff-0005-0005-0005-000000000005");

    // Default walk-in shifts (one per clinic) so the medico can always check in
    private static readonly Guid ShiftAlphaId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccc01");
    private static readonly Guid ShiftBetaId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccc02");

    public DatabaseSeeder(AppDbContext context, IPasswordHashService passwordHashService)
    {
        _context = context;
        _passwordHashService = passwordHashService;
    }

    /// <summary>
    /// Seed minimo one-shot para prod: cria APENAS o registro de gestor
    /// publico (User + PublicOrgan fake sem CNPJ + UserPublicOrganRole) para
    /// destravar o Portal Prefeitura sem trazer todo o restante do seed de
    /// demonstracao (admin, medicos, clinicas, plantoes, alerts, etc).
    ///
    /// Uso pretendido: rodado uma unica vez em prod via flag
    /// <c>RUN_GESTOR_SEED_ONCE=true</c> no Program.cs, depois a flag e
    /// removida. Idempotente por Id fixo — pode ser rodado varias vezes
    /// que so cria o que ainda nao existe.
    ///
    /// A PublicOrgan usada aqui e propositalmente marcada como "E2E" para
    /// nao ser confundida com uma prefeitura real; se o seed full
    /// (<see cref="SeedAsync"/>) rodar depois, a Santo Andre real coexiste
    /// com essa fake, e o gestor continua vinculado a fake ate ser
    /// re-vinculado manualmente via Admin OS.
    /// </summary>
    public async Task SeedGestorMinimalAsync()
    {
        var now = DateTime.UtcNow;

        // Id fixo distinto dos organs reais do seed full, pra evitar qualquer
        // colisao acidental de CNPJ/dados quando o seed full rodar depois.
        var e2eOrganId = Guid.Parse("dddddddd-e2e0-e2e0-e2e0-000000000001");

        // 1) PublicOrgan fake (sem CNPJ — o campo e nullable — pra nao
        //    colidir com CNPJs reais de prefeituras existentes).
        if (!await _context.PublicOrgans.AnyAsync(p => p.Id == e2eOrganId))
        {
            _context.PublicOrgans.Add(new PublicOrgan
            {
                Id = e2eOrganId,
                Name = "OS Teste - Portal Prefeitura (E2E)",
                Acronym = "E2E-OS",
                Cnpj = null,
                Department = "Ambiente de teste automatizado",
                IsActive = true,
                CreatedAt = now,
            });
        }

        // 2) User gestor (idempotente por Id fixo, mesmo Id que o seed full usa).
        if (!await _context.Users.AnyAsync(u => u.Id == GestorPublicoUserId))
        {
            _context.Users.Add(new User
            {
                Id = GestorPublicoUserId,
                Email = "gestor@plantonhub.com",
                Name = "Gestor Prefeitura Teste",
                PasswordHash = _passwordHashService.HashPassword("Teste@123"),
                CreatedAt = now,
                UpdatedAt = now,
                IsActive = true,
                // Nao define ProfessionalType — gestor nao e profissional de saude.
            });
        }

        await _context.SaveChangesAsync();

        // 3) Vinculo UserPublicOrganRole (Id fixo, so cria se nao existe).
        if (!await _context.UserPublicOrganRoles.AnyAsync(r => r.Id == GestorPublicoRoleId))
        {
            _context.UserPublicOrganRoles.Add(new UserPublicOrganRole
            {
                Id = GestorPublicoRoleId,
                UserId = GestorPublicoUserId,
                PublicOrganId = e2eOrganId,
                Role = RoleType.GestorPublico,
                AssignedAt = now,
            });

            await _context.SaveChangesAsync();
        }
    }

    public async Task SeedAsync()
    {
        // Idempotency check: skip if users already exist
        if (await _context.Users.AnyAsync(u => u.Email == "admin@plantonhub.com"))
        {
            // Even if base seed was done, ensure the follow-up seed blocks are applied
            await SeedPublicOrgansAndContractsAsync();
            await SeedAvailabilityRestrictionsAsync();
            await SeedExtraDoctorsAndSubstitutionsAsync();
            await SeedAuditLogsAsync();
            await SeedAlertsAsync();
            await SeedGestorPublicoAsync();
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

        // ── Cenário de HOJE para a tela "Tempo Real" ─────────────────────
        // Cria plantões nas duas clínicas cobrindo o momento atual e gera
        // check-ins variados para popular os status: presente, atrasado,
        // ausente, escalado e vagas abertas.
        SeedTempoRealScenario(now);

        await _context.SaveChangesAsync();

        await SeedPublicOrgansAndContractsAsync();
        await SeedAvailabilityRestrictionsAsync();
        await SeedExtraDoctorsAndSubstitutionsAsync();
        await SeedAuditLogsAsync();
        await SeedAlertsAsync();
        await SeedGestorPublicoAsync();
    }

    /// <summary>
    /// Semeia o user gestor público (portal Prefeitura — Sprint 7A) e seu
    /// vínculo com a Prefeitura de Santo André. Idempotente por Id fixo em
    /// ambas as pontas: pode rodar após base seed limpo ou em base legada
    /// com admin já existente. Depende de <see cref="SeedPublicOrgansAndContractsAsync"/>
    /// ter rodado antes (a chamada em <c>SeedAsync</c> garante a ordem).
    /// </summary>
    private async Task SeedGestorPublicoAsync()
    {
        var now = DateTime.UtcNow;

        // 1) User gestor (idempotente por Id fixo).
        if (!await _context.Users.AnyAsync(u => u.Id == GestorPublicoUserId))
        {
            _context.Users.Add(new User
            {
                Id = GestorPublicoUserId,
                Email = "gestor@plantonhub.com",
                Name = "Gestor Prefeitura Teste",
                PasswordHash = _passwordHashService.HashPassword("Teste@123"),
                CreatedAt = now,
                UpdatedAt = now,
                IsActive = true,
                // Não define ProfessionalType — gestor não é profissional de
                // saúde e não aparece em telas de escala/atendimento.
            });
        }

        // 2) Vínculo UserPublicOrganRole (só cria quando o organ já existe).
        // Guard defensivo — em teoria SeedPublicOrgansAndContractsAsync rodou
        // antes, mas se o seed dele foi pulado (ex.: reset parcial), evitamos
        // FK violation.
        var organExists = await _context.PublicOrgans
            .AnyAsync(p => p.Id == PublicOrganSantoAndreId);

        if (organExists && !await _context.UserPublicOrganRoles.AnyAsync(r => r.Id == GestorPublicoRoleId))
        {
            _context.UserPublicOrganRoles.Add(new UserPublicOrganRole
            {
                Id = GestorPublicoRoleId,
                UserId = GestorPublicoUserId,
                PublicOrganId = PublicOrganSantoAndreId,
                Role = RoleType.GestorPublico,
                AssignedAt = now,
            });
        }

        await _context.SaveChangesAsync();
    }

    /// <summary>
    /// Popula plantões de HOJE + check-ins reais para a tela "Tempo Real".
    /// Gera cenários variados (presente/atrasado/ausente/vaga aberta) usando
    /// as tolerâncias padrão (15 min tolerância, 60 min ausência).
    /// </summary>
    private void SeedTempoRealScenario(DateTime now)
    {
        var today = now.Date;

        // Extra doctors para popular os plantões — não precisam de login,
        // servem só como "escalados" na tela Tempo Real.
        var extraDoctors = new[]
        {
            (Id: Guid.Parse("55555555-0001-0001-0001-000000000001"), Name: "Dra. Jessica Lima",   Crm: "CRM 5485-SP"),
            (Id: Guid.Parse("55555555-0002-0002-0002-000000000002"), Name: "Dr. Roberto Alves",   Crm: "CRM 8821-SP"),
            (Id: Guid.Parse("55555555-0003-0003-0003-000000000003"), Name: "Dra. Camila Ferraz",  Crm: "CRM 3312-SP"),
            (Id: Guid.Parse("55555555-0004-0004-0004-000000000004"), Name: "Dr. André Souza",     Crm: "CRM 6512-SP"),
            (Id: Guid.Parse("55555555-0005-0005-0005-000000000005"), Name: "Dr. Paulo Henrique",  Crm: "CRM 4721-SP"),
            (Id: Guid.Parse("55555555-0006-0006-0006-000000000006"), Name: "Dra. Mariana Costa",  Crm: "CRM 2211-SP"),
            (Id: Guid.Parse("55555555-0007-0007-0007-000000000007"), Name: "Dra. Renata Silva",   Crm: "CRM 4478-SP"),
        };

        foreach (var (id, name, crm) in extraDoctors)
        {
            _context.Users.Add(new User
            {
                Id = id,
                Email = $"{id}@seed.plantonhub.com",
                Name = name,
                PasswordHash = _passwordHashService.HashPassword("Teste@123"),
                CreatedAt = now,
                UpdatedAt = now,
                ProfessionalType = ProfessionalType.Medico,
                IsActive = true,
                RegistrationNumber = crm,
                Specialty = "Emergência",
            });
        }

        // Assumindo que o turno da manhã começou há 40 minutos (7:00 é o padrão,
        // e agora é ~7:40): tolerância padrão é 15 min → atrasado ainda não é
        // ausente (< 60 min). Ideal pra mostrar vários status ao mesmo tempo.
        // Como não podemos forçar a hora atual do sistema, calibramos os horários
        // dos plantões *relativos ao agora* para produzir os status desejados.
        //
        // Setup dos turnos (todos com Date = hoje):
        //   Alpha Manhã:  começa há 40 min → tolerância vencida (15 min), ainda não é ausente (60 min)
        //   Alpha Tarde:  começa em 2h    → escalado (futuro)
        //   Beta Manhã:   começa há 90 min → ultrapassou threshold de ausência (60 min)
        var alphaManhaStart = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(40));
        var alphaTardeStart = now.TimeOfDay.Add(TimeSpan.FromHours(2));
        var betaManhaStart  = now.TimeOfDay.Subtract(TimeSpan.FromMinutes(90));

        // Se o intervalo virar o dia (edge case), pula silenciosamente
        if (alphaManhaStart < TimeSpan.Zero || betaManhaStart < TimeSpan.Zero ||
            alphaTardeStart >= TimeSpan.FromDays(1))
            return;

        // ── Clínica Alpha: turno da manhã em andamento (2 escalados + 1 vaga) ──
        var alphaManhaShiftId = Guid.Parse("aaaa1111-aaaa-aaaa-aaaa-000000000001");
        var alphaManhaShift = new Shift
        {
            Id = alphaManhaShiftId,
            ClinicId = ClinicAlphaId,
            Title = "Plantão Manhã",
            Date = today,
            StartTime = alphaManhaStart,
            EndTime = alphaManhaStart.Add(TimeSpan.FromHours(12)),
            CreatedAt = now,
        };

        var alphaManhaAssignments = new[]
        {
            new ShiftAssignment { Id = Guid.NewGuid(), ShiftId = alphaManhaShiftId, UserId = extraDoctors[0].Id, AssignedAt = now }, // Jessica: fará check-in
            new ShiftAssignment { Id = Guid.NewGuid(), ShiftId = alphaManhaShiftId, UserId = extraDoctors[1].Id, AssignedAt = now }, // Roberto: sem check-in → atrasado
        };

        // Jessica: check-in há 35 min → status Presente
        var jessicaCheckIn = new Attendance
        {
            Id = Guid.NewGuid(),
            UserId = extraDoctors[0].Id,
            ShiftId = alphaManhaShiftId,
            ClinicId = ClinicAlphaId,
            CheckInTime = now.AddMinutes(-35),
            CheckInLatitude = -23.5505,
            CheckInLongitude = -46.6333,
            CheckInDeviceId = "seed-tempo-real",
            BiometricValidated = true,
            SyncSource = Domain.Enums.SyncSource.Online,
            SyncStatus = Domain.Enums.SyncStatus.OnlineSynced,
        };

        // ── Clínica Alpha: turno da tarde ainda por começar ──
        var alphaTardeShiftId = Guid.Parse("aaaa2222-aaaa-aaaa-aaaa-000000000002");
        var alphaTardeShift = new Shift
        {
            Id = alphaTardeShiftId,
            ClinicId = ClinicAlphaId,
            Title = "Plantão Tarde",
            Date = today,
            StartTime = alphaTardeStart,
            EndTime = alphaTardeStart.Add(TimeSpan.FromHours(6)),
            CreatedAt = now,
        };

        var alphaTardeAssignments = new[]
        {
            new ShiftAssignment { Id = Guid.NewGuid(), ShiftId = alphaTardeShiftId, UserId = extraDoctors[2].Id, AssignedAt = now }, // Camila: escalado (futuro)
            new ShiftAssignment { Id = Guid.NewGuid(), ShiftId = alphaTardeShiftId, UserId = extraDoctors[3].Id, AssignedAt = now }, // André: escalado (futuro)
        };

        // ── Clínica Beta: turno em andamento com problema (ausência confirmada) ──
        var betaManhaShiftId = Guid.Parse("bbbb1111-bbbb-bbbb-bbbb-000000000001");
        var betaManhaShift = new Shift
        {
            Id = betaManhaShiftId,
            ClinicId = ClinicBetaId,
            Title = "Plantão Manhã",
            Date = today,
            StartTime = betaManhaStart,
            EndTime = betaManhaStart.Add(TimeSpan.FromHours(12)),
            CreatedAt = now,
        };

        var betaManhaAssignments = new[]
        {
            new ShiftAssignment { Id = Guid.NewGuid(), ShiftId = betaManhaShiftId, UserId = extraDoctors[4].Id, AssignedAt = now }, // Paulo: fará check-in
            new ShiftAssignment { Id = Guid.NewGuid(), ShiftId = betaManhaShiftId, UserId = extraDoctors[5].Id, AssignedAt = now }, // Mariana: fará check-in atrasado
            new ShiftAssignment { Id = Guid.NewGuid(), ShiftId = betaManhaShiftId, UserId = extraDoctors[6].Id, AssignedAt = now }, // Renata: sem check-in → ausente
        };

        // Paulo: check-in há 85 min (chegou pouco depois do início do turno) → Presente
        var pauloCheckIn = new Attendance
        {
            Id = Guid.NewGuid(),
            UserId = extraDoctors[4].Id,
            ShiftId = betaManhaShiftId,
            ClinicId = ClinicBetaId,
            CheckInTime = now.AddMinutes(-85),
            CheckInLatitude = -23.5605,
            CheckInLongitude = -46.6433,
            CheckInDeviceId = "seed-tempo-real",
            BiometricValidated = true,
            SyncSource = Domain.Enums.SyncSource.Online,
            SyncStatus = Domain.Enums.SyncStatus.OnlineSynced,
        };

        // Mariana: check-in há 30 min (chegou muito atrasada, mas chegou) → Presente
        var marianaCheckIn = new Attendance
        {
            Id = Guid.NewGuid(),
            UserId = extraDoctors[5].Id,
            ShiftId = betaManhaShiftId,
            ClinicId = ClinicBetaId,
            CheckInTime = now.AddMinutes(-30),
            CheckInLatitude = -23.5605,
            CheckInLongitude = -46.6433,
            CheckInDeviceId = "seed-tempo-real",
            BiometricValidated = true,
            SyncSource = Domain.Enums.SyncSource.Online,
            SyncStatus = Domain.Enums.SyncStatus.OnlineSynced,
        };

        _context.Shifts.AddRange(alphaManhaShift, alphaTardeShift, betaManhaShift);
        _context.ShiftAssignments.AddRange(alphaManhaAssignments);
        _context.ShiftAssignments.AddRange(alphaTardeAssignments);
        _context.ShiftAssignments.AddRange(betaManhaAssignments);
        _context.Attendances.AddRange(jessicaCheckIn, pauloCheckIn, marianaCheckIn);
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

    /// <summary>
    /// Popula médicos extras (usados como ausente/substituto) e substituições
    /// de exemplo para a tela de Substituições. Idempotente: só cria o que ainda não existe.
    /// </summary>
    private async Task SeedExtraDoctorsAndSubstitutionsAsync()
    {
        var now = DateTime.UtcNow;
        var today = now.Date;

        // ── Médicos extras ────────────────────────────────────────────────

        var extras = new (Guid Id, string Name, string Email, string Crm)[]
        {
            (MedicoRenataId,  "Dra. Renata Silva",   "renata.silva@plantonhub.com",   "CRM 4478-SP"),
            (MedicoJessicaId, "Dra. Jessica Lima",   "jessica.lima@plantonhub.com",   "CRM 5485-SP"),
            (MedicoRobertoId, "Dr. Roberto Alves",   "roberto.alves@plantonhub.com",  "CRM 8821-SP"),
            (MedicoMarceloId, "Dr. Marcelo Dias",    "marcelo.dias@plantonhub.com",   "CRM 3345-SP"),
            (MedicoCamilaId,  "Dra. Camila Ferraz",  "camila.ferraz@plantonhub.com",  "CRM 3312-SP"),
        };

        foreach (var (id, name, email, crm) in extras)
        {
            if (await _context.Users.AnyAsync(u => u.Id == id)) continue;

            _context.Users.Add(new User
            {
                Id = id,
                Email = email,
                Name = name,
                PasswordHash = _passwordHashService.HashPassword("Teste@123"),
                CreatedAt = now,
                UpdatedAt = now,
                ProfessionalType = ProfessionalType.Medico,
                IsActive = true,
                RegistrationNumber = crm,
                Specialty = "Clínica Geral",
            });

            // Vincula a Alpha (todos) e alguns também a Beta para termos overlap entre UPAs
            _context.UserClinicRoles.Add(new UserClinicRole
            {
                Id = Guid.NewGuid(),
                UserId = id,
                ClinicId = ClinicAlphaId,
                Role = RoleType.Medico,
                AssignedAt = now,
            });
            if (id == MedicoJessicaId || id == MedicoRobertoId)
            {
                _context.UserClinicRoles.Add(new UserClinicRole
                {
                    Id = Guid.NewGuid(),
                    UserId = id,
                    ClinicId = ClinicBetaId,
                    Role = RoleType.Medico,
                    AssignedAt = now,
                });
            }
        }

        await _context.SaveChangesAsync();

        // ── Substituições de exemplo ─────────────────────────────────────

        // 1) Urgente — plantão de HOJE, sem substituto (aparece no KPI "Urgentes")
        if (!await _context.Substitutions.AnyAsync(s => s.Id == SubstitutionUrgenteId))
        {
            _context.Substitutions.Add(new Substitution
            {
                Id = SubstitutionUrgenteId,
                ClinicId = ClinicAlphaId,
                ShiftDate = DateTime.SpecifyKind(today, DateTimeKind.Utc),
                ShiftLabel = "Manhã (07h–19h)",
                ShiftStartTime = new TimeSpan(7, 0, 0),
                ShiftEndTime = new TimeSpan(19, 0, 0),
                ReasonType = SubstitutionReasonType.UnannouncedAbsence,
                Notes = "Ausência sem comunicação prévia",
                AbsentUserId = MedicoRenataId,
                SubstituteUserId = null,
                Status = SubstitutionStatus.Pending,
                ConfirmedAt = null,
                CreatedAt = now.AddHours(-4),
            });
        }

        // 2) Pendente antecipada — plantão em 2 dias, sem substituto
        if (!await _context.Substitutions.AnyAsync(s => s.Id == SubstitutionPendenteId))
        {
            _context.Substitutions.Add(new Substitution
            {
                Id = SubstitutionPendenteId,
                ClinicId = ClinicBetaId,
                ShiftDate = DateTime.SpecifyKind(today.AddDays(2), DateTimeKind.Utc),
                ShiftLabel = "Manhã (07h–19h)",
                ShiftStartTime = new TimeSpan(7, 0, 0),
                ShiftEndTime = new TimeSpan(19, 0, 0),
                ReasonType = SubstitutionReasonType.AdvanceNotice,
                Notes = "Consulta médica pessoal",
                AbsentUserId = MedicoMarceloId,
                SubstituteUserId = null,
                Status = SubstitutionStatus.Pending,
                ConfirmedAt = null,
                CreatedAt = now.AddDays(-1),
            });
        }

        // 3) Confirmada — atestado, ontem, com substituto definido
        if (!await _context.Substitutions.AnyAsync(s => s.Id == SubstitutionConfirmadaId))
        {
            _context.Substitutions.Add(new Substitution
            {
                Id = SubstitutionConfirmadaId,
                ClinicId = ClinicAlphaId,
                ShiftDate = DateTime.SpecifyKind(today.AddDays(-1), DateTimeKind.Utc),
                ShiftLabel = "Noite (19h–07h)",
                ShiftStartTime = new TimeSpan(19, 0, 0),
                ShiftEndTime = new TimeSpan(7, 0, 0),
                ReasonType = SubstitutionReasonType.MedicalCertificate,
                Notes = "Atestado médico apresentado",
                AbsentUserId = MedicoCamilaId,
                SubstituteUserId = MedicoJessicaId,
                Status = SubstitutionStatus.Confirmed,
                ConfirmedAt = now.AddDays(-1).AddHours(-2),
                CreatedAt = now.AddDays(-2),
            });
        }

        // 4) Confirmada — troca de turno, com substituto
        if (!await _context.Substitutions.AnyAsync(s => s.Id == SubstitutionAtestadoId))
        {
            _context.Substitutions.Add(new Substitution
            {
                Id = SubstitutionAtestadoId,
                ClinicId = ClinicBetaId,
                ShiftDate = DateTime.SpecifyKind(today.AddDays(-3), DateTimeKind.Utc),
                ShiftLabel = "Manhã (07h–19h)",
                ShiftStartTime = new TimeSpan(7, 0, 0),
                ShiftEndTime = new TimeSpan(19, 0, 0),
                ReasonType = SubstitutionReasonType.ShiftSwap,
                Notes = "Troca acordada entre os médicos",
                AbsentUserId = MedicoRobertoId,
                SubstituteUserId = MedicoJessicaId,
                Status = SubstitutionStatus.Confirmed,
                ConfirmedAt = now.AddDays(-4),
                CreatedAt = now.AddDays(-5),
            });
        }

        await _context.SaveChangesAsync();

        await SeedJustificationsAsync();
    }

    /// <summary>
    /// Popula justificativas (acionamentos da Prefeitura → OS) de exemplo
    /// para a tela de Justificativas. Idempotente por ID fixo.
    /// </summary>
    private async Task SeedJustificationsAsync()
    {
        var now = DateTime.UtcNow;
        var today = now.Date;

        // 1) Vencida — prazo já passou e ainda não foi respondida (aparece como "Vencido")
        if (!await _context.Justifications.AnyAsync(j => j.Id == JustificationOverdueId))
        {
            _context.Justifications.Add(new Justification
            {
                Id = JustificationOverdueId,
                ProtocolNumber = "JUS-2026-041",
                ClinicId = ClinicAlphaId,
                AbsentUserId = MedicoRenataId,
                ShiftDate = DateTime.SpecifyKind(today.AddDays(-8), DateTimeKind.Utc),
                ShiftTurn = "Manhã",
                RequestType = JustificationRequestType.FormalJustification,
                RequestText = "A médica Dra. Renata Silva não compareceu ao plantão da manhã sem comunicação prévia. Solicitamos justificativa formal dentro do prazo de 48 horas conforme cláusula 8.2 do contrato CT-2024-0087.",
                DeadlineDate = DateTime.SpecifyKind(today.AddDays(-3), DateTimeKind.Utc),
                Status = JustificationStatus.Pending,
                CreatedAt = now.AddDays(-8),
            });
        }

        // 2) Aguardando análise — prazo dentro de 2 dias
        if (!await _context.Justifications.AnyAsync(j => j.Id == JustificationPendingId))
        {
            _context.Justifications.Add(new Justification
            {
                Id = JustificationPendingId,
                ProtocolNumber = "JUS-2026-040",
                ClinicId = ClinicBetaId,
                AbsentUserId = MedicoMarceloId,
                ShiftDate = DateTime.SpecifyKind(today.AddDays(-1), DateTimeKind.Utc),
                ShiftTurn = "Manhã",
                RequestType = JustificationRequestType.ShiftReplacement,
                RequestText = "O Dr. Marcelo Dias registrou atraso de 50 minutos no plantão, comprometendo o atendimento. Solicitamos a reposição das horas não cumpridas ou compensação equivalente.",
                DeadlineDate = DateTime.SpecifyKind(today.AddDays(2), DateTimeKind.Utc),
                Status = JustificationStatus.Pending,
                CreatedAt = now.AddDays(-1),
            });
        }

        // 3) Em análise
        if (!await _context.Justifications.AnyAsync(j => j.Id == JustificationUnderAnalId))
        {
            _context.Justifications.Add(new Justification
            {
                Id = JustificationUnderAnalId,
                ProtocolNumber = "JUS-2026-038",
                ClinicId = ClinicAlphaId,
                AbsentUserId = MedicoRenataId,
                ShiftDate = DateTime.SpecifyKind(today.AddDays(-5), DateTimeKind.Utc),
                ShiftTurn = "Noite",
                RequestType = JustificationRequestType.RegisterWarning,
                RequestText = "Reincidência de ausência não comunicada. Solicitamos registro formal de advertência e plano de ação para evitar recorrências.",
                DeadlineDate = DateTime.SpecifyKind(today.AddDays(5), DateTimeKind.Utc),
                Status = JustificationStatus.UnderAnalysis,
                CreatedAt = now.AddDays(-4),
            });
        }

        // 4) Aprovada — respondida com atestado válido
        if (!await _context.Justifications.AnyAsync(j => j.Id == JustificationApprovedId))
        {
            _context.Justifications.Add(new Justification
            {
                Id = JustificationApprovedId,
                ProtocolNumber = "JUS-2026-030",
                ClinicId = ClinicBetaId,
                AbsentUserId = MedicoJessicaId,
                ShiftDate = DateTime.SpecifyKind(today.AddDays(-12), DateTimeKind.Utc),
                ShiftTurn = "Tarde",
                RequestType = JustificationRequestType.FormalJustification,
                RequestText = "Ausência comunicada. Solicitamos formalização da justificativa e comprovação documental.",
                DeadlineDate = DateTime.SpecifyKind(today.AddDays(-7), DateTimeKind.Utc),
                Status = JustificationStatus.Approved,
                ResponseText = "Ausência devidamente justificada com atestado médico válido registrado no CRM. Justificativa aceita.",
                RespondedAt = now.AddDays(-8),
                RespondedByUserId = AdminUserId,
                CreatedAt = now.AddDays(-12),
            });
        }

        // 5) Reprovada — com penalidade aplicada
        if (!await _context.Justifications.AnyAsync(j => j.Id == JustificationRejectedId))
        {
            _context.Justifications.Add(new Justification
            {
                Id = JustificationRejectedId,
                ProtocolNumber = "JUS-2026-028",
                ClinicId = ClinicBetaId,
                AbsentUserId = MedicoRobertoId,
                ShiftDate = DateTime.SpecifyKind(today.AddDays(-15), DateTimeKind.Utc),
                ShiftTurn = "Manhã",
                RequestType = JustificationRequestType.ContractPenalty,
                RequestText = "Ausência sem justificativa plausível. Solicitamos aplicação de penalidade contratual conforme cláusula 12.3.",
                DeadlineDate = DateTime.SpecifyKind(today.AddDays(-10), DateTimeKind.Utc),
                Status = JustificationStatus.Rejected,
                ResponseText = "OS não apresentou documentação comprobatória dentro do prazo estipulado. Penalidade contratual aplicada.",
                RespondedAt = now.AddDays(-11),
                RespondedByUserId = AdminUserId,
                CreatedAt = now.AddDays(-15),
            });
        }

        await _context.SaveChangesAsync();
    }

    /// <summary>
    /// Popula exemplos de restrições de disponibilidade nos médicos do cenário
    /// "Tempo Real" (extraDoctors) para visualização imediata da tela.
    /// Idempotente: só executa quando ainda não há restrições cadastradas.
    /// </summary>
    private async Task SeedAvailabilityRestrictionsAsync()
    {
        if (await _context.AvailabilityRestrictions.AnyAsync())
            return;

        var now = DateTime.UtcNow;
        var today = DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);

        // IDs correspondentes aos extraDoctors do SeedTempoRealScenario
        var camilaId  = Guid.Parse("55555555-0003-0003-0003-000000000003"); // Dra. Camila Ferraz
        var robertoId = Guid.Parse("55555555-0002-0002-0002-000000000002"); // Dr. Roberto Alves
        var renataId  = Guid.Parse("55555555-0007-0007-0007-000000000007"); // Dra. Renata Silva
        var andreId   = Guid.Parse("55555555-0004-0004-0004-000000000004"); // Dr. André Souza

        // Só semeia se pelo menos um dos usuários referenciados existir —
        // evita falha se o cenário de tempo real ainda não tiver rodado.
        if (!await _context.Users.AnyAsync(u => u.Id == camilaId))
            return;

        var oneYear = today.AddYears(1);

        _context.AvailabilityRestrictions.AddRange(
            // Camila: em férias começando em 3 dias por 12 dias
            new AvailabilityRestriction
            {
                Id = Guid.Parse("dddd0001-0001-0001-0001-000000000001"),
                UserId = camilaId,
                Type = AvailabilityRestrictionType.Ferias,
                StartDate = today.AddDays(3),
                EndDate = today.AddDays(15),
                Notes = "Férias programadas.",
                CreatedAt = now,
                CreatedByUserId = AdminUserId,
            },
            // Roberto: restrição fixa de turno noite (bit 2)
            new AvailabilityRestriction
            {
                Id = Guid.Parse("dddd0002-0002-0002-0002-000000000002"),
                UserId = robertoId,
                Type = AvailabilityRestrictionType.RestricaoTurno,
                StartDate = today,
                EndDate = oneYear,
                BlockedShiftsMask = 0b100, // Noite
                Notes = "Restrição médica para turno noturno.",
                CreatedAt = now,
                CreatedByUserId = AdminUserId,
            },
            // Renata: licença médica em curso
            new AvailabilityRestriction
            {
                Id = Guid.Parse("dddd0003-0003-0003-0003-000000000003"),
                UserId = renataId,
                Type = AvailabilityRestrictionType.LicencaMedica,
                StartDate = today.AddDays(-5),
                EndDate = today.AddDays(25),
                Notes = "Atestado #A-2026-4478.",
                CreatedAt = now,
                CreatedByUserId = AdminUserId,
            },
            // André: dias específicos (Dom e Sáb) — bit 0 + bit 6
            new AvailabilityRestriction
            {
                Id = Guid.Parse("dddd0004-0004-0004-0004-000000000004"),
                UserId = andreId,
                Type = AvailabilityRestrictionType.DiasEspecificos,
                StartDate = today,
                EndDate = oneYear,
                BlockedWeekdaysMask = 0b1000001, // Dom + Sáb
                Notes = "Restrição recorrente de fins de semana.",
                CreatedAt = now,
                CreatedByUserId = AdminUserId,
            }
        );

        await _context.SaveChangesAsync();
    }

    /// <summary>
    /// Popula alguns exemplos de audit log (últimos 10 dias) para a tela
    /// Auditoria já mostrar dados sem depender de eventos reais. Idempotente
    /// pela existência de qualquer registro.
    /// </summary>
    private async Task SeedAuditLogsAsync()
    {
        if (await _context.AuditLogs.AnyAsync()) return;

        var now = DateTime.UtcNow;
        var today = now.Date;

        // Só semeia se pelo menos o admin já existe (é o principal ator)
        if (!await _context.Users.AnyAsync(u => u.Id == AdminUserId)) return;

        var admin = AdminUserId;
        var adminClinica = AdminClinicaUserId;
        var medico = MedicoUserId;
        var enfermeiro = EnfermeiroUserId;

        DateTime At(int daysAgo, int h, int min) =>
            DateTime.SpecifyKind(today.AddDays(-daysAgo).AddHours(h).AddMinutes(min), DateTimeKind.Utc);

        _context.AuditLogs.AddRange(
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = admin, Timestamp = At(0, 11, 23),
                Operation = "Update", Module = "Configurações", Entity = "SystemSettings", EntityId = "singleton",
                Details = "Tolerância de atraso alterada",
                BeforeValue = "10 min", AfterValue = "15 min", IpAddress = "189.14.55.22",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = admin, Timestamp = At(0, 11, 20),
                Operation = "Login", Module = "Acesso", Entity = "User", EntityId = admin.ToString(),
                Details = "Login no sistema — MFA validado com sucesso",
                IpAddress = "189.14.55.22",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = adminClinica, Timestamp = At(0, 9, 45),
                Operation = "Update", Module = "Escalas", Entity = "Shift", EntityId = Guid.NewGuid().ToString(),
                Details = "Escala editada — UPA Centro (12/05 — noite)",
                BeforeValue = "Vaga em aberto", AfterValue = "Dr. Roberto Alves", IpAddress = "187.32.10.4",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = adminClinica, Timestamp = At(0, 9, 30),
                Operation = "Login", Module = "Acesso", Entity = "User", EntityId = adminClinica.ToString(),
                Details = "Login no sistema — MFA validado com sucesso",
                IpAddress = "187.32.10.4",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = admin, Timestamp = At(1, 18, 55),
                Operation = "Create", Module = "Médicos", Entity = "User", EntityId = Guid.NewGuid().ToString(),
                Details = "Médico cadastrado — Dr. Lucas Prado (CRM 8834-SP)",
                AfterValue = "Ativo", IpAddress = "200.148.3.91",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = admin, Timestamp = At(1, 16, 22),
                Operation = "Export", Module = "Faturamento", Entity = "Report", EntityId = "faturamento-2026-05",
                Details = "Relatório de Faturamento exportado — Maio/2026 (14 profissionais)",
                IpAddress = "189.14.55.22",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = adminClinica, Timestamp = At(1, 11, 5),
                Operation = "Create", Module = "Escalas", Entity = "Shift", EntityId = Guid.NewGuid().ToString(),
                Details = "Escala publicada — UPA Vila Pereira (semana 11/05–17/05)",
                BeforeValue = "Rascunho", AfterValue = "Publicada", IpAddress = "187.32.10.4",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = admin, Timestamp = At(1, 10, 44),
                Operation = "Config", Module = "Configurações", Entity = "Integration", EntityId = "azure-face-api",
                Details = "Integração Azure Face API atualizada — teste OK (142ms)",
                BeforeValue = "v1 endpoint", AfterValue = "v2 endpoint", IpAddress = "189.14.55.22",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = admin, Timestamp = At(2, 20, 1),
                Operation = "System", Module = "Notificações", Entity = "Alert", EntityId = "auto-alert-1",
                Details = "Alerta automático — turno da noite sem cobertura (UPA Centro)",
                IpAddress = "10.0.0.1",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = admin, Timestamp = At(2, 17, 30),
                Operation = "Delete", Module = "Usuários", Entity = "User", EntityId = Guid.NewGuid().ToString(),
                Details = "Usuário desativado — inatividade > 90 dias",
                BeforeValue = "Ativo", AfterValue = "Inativo", IpAddress = "189.14.55.22",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = admin, Timestamp = At(2, 14, 20),
                Operation = "Update", Module = "Contratos", Entity = "Contract", EntityId = Guid.NewGuid().ToString(),
                Details = "Contrato atualizado — Prefeitura de Guarulhos (meta de SLA)",
                BeforeValue = "80%", AfterValue = "85%", IpAddress = "189.14.55.22",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = medico, Timestamp = At(3, 7, 2),
                Operation = "System", Module = "Biometria", Entity = "FaceEnrollment", EntityId = medico.ToString(),
                Details = "Reconhecimento facial — check-in (confiança 98,7%)",
                AfterValue = "Check-in 07:02", IpAddress = "10.0.1.5",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = enfermeiro, Timestamp = At(3, 12, 15),
                Operation = "Update", Module = "Justificativas", Entity = "Justification", EntityId = Guid.NewGuid().ToString(),
                Details = "Justificativa aprovada — atestado médico válido",
                BeforeValue = "Pendente", AfterValue = "Aprovada", IpAddress = "177.88.21.3",
            },
            new AuditLog
            {
                Id = Guid.NewGuid(), UserId = enfermeiro, Timestamp = At(5, 15, 10),
                Operation = "Update", Module = "Substituições", Entity = "Substitution", EntityId = Guid.NewGuid().ToString(),
                Details = "Substituto designado — Dr. Roberto cobre plantão de Dra. Camila",
                BeforeValue = "Pendente", AfterValue = "Confirmada", IpAddress = "177.88.21.3",
            }
        );

        await _context.SaveChangesAsync();
    }

    /// <summary>
    /// Popula a Central de Alertas com registros de exemplo, cobrindo todos
    /// os níveis (Critical/Warning/Info/Resolved). Idempotente por Code.
    /// </summary>
    private async Task SeedAlertsAsync()
    {
        if (await _context.Alerts.AnyAsync()) return;

        var now = DateTime.UtcNow;
        var today = now.Date;

        _context.Alerts.AddRange(
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-041",
                Level = AlertLevel.Critical, Type = AlertType.UncoveredShift,
                Title = "Turno da noite sem cobertura",
                Description = "Nenhum médico está escalado para o turno <strong>19h–07h de amanhã</strong> na UPA Centro. Sem ação, o turno ficará completamente descoberto.",
                ClinicId = ClinicBetaId,
                PrimaryActionLabel = "Designar substituto",
                SecondaryActionLabel = "Ver escalas",
                IsResolved = false,
                CreatedAt = now.AddHours(-1),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-040",
                Level = AlertLevel.Critical, Type = AlertType.UnannouncedAbsence,
                Title = "Ausência não comunicada — Dra. Renata Silva",
                Description = "Dra. Renata Silva não realizou check-in no plantão da <strong>manhã de hoje (07h00)</strong> e não comunicou a ausência. Esta é a <strong>7ª ocorrência</strong> no mês.",
                ClinicId = ClinicAlphaId,
                RelatedUserId = MedicoRenataId,
                PrimaryActionLabel = "Registrar substituição",
                SecondaryActionLabel = "Notificar médico",
                IsResolved = false,
                CreatedAt = now.AddHours(-4),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-039",
                Level = AlertLevel.Warning, Type = AlertType.Delay,
                Title = "Atraso de 38 min — Dr. Marcelo Dias",
                Description = "Dr. Marcelo Dias realizou check-in às <strong>07:38h</strong>, com <strong>38 minutos</strong> de atraso no turno da manhã (tolerância: 15 min). Terceira ocorrência consecutiva.",
                ClinicId = ClinicBetaId,
                RelatedUserId = MedicoMarceloId,
                PrimaryActionLabel = "Registrar ocorrência",
                SecondaryActionLabel = "Ver histórico",
                IsResolved = false,
                CreatedAt = now.AddHours(-3),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-038",
                Level = AlertLevel.Warning, Type = AlertType.SlaBelow,
                Title = "SLA abaixo da meta — Prefeitura de Guarulhos",
                Description = "O cumprimento de SLA do contrato <strong>CT-2023-0142</strong> caiu para <strong>81,4%</strong>, abaixo da meta contratual de <strong>85%</strong>. Risco de penalidade contratual.",
                ClinicId = null, // global
                PrimaryActionLabel = "Ver relatório gerencial",
                SecondaryActionLabel = "Contatar prefeitura",
                IsResolved = false,
                CreatedAt = now.AddHours(-5),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-037",
                Level = AlertLevel.Warning, Type = AlertType.Delay,
                Title = "Atraso de 22 min — Dr. Roberto Alves",
                Description = "Dr. Roberto Alves realizou check-in às <strong>07:22h</strong> no turno da manhã. Tolerância padrão de 15 minutos excedida.",
                ClinicId = ClinicAlphaId,
                RelatedUserId = MedicoRobertoId,
                PrimaryActionLabel = "Registrar ocorrência",
                SecondaryActionLabel = "Ignorar",
                IsResolved = false,
                CreatedAt = now.AddHours(-6),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-036",
                Level = AlertLevel.Info, Type = AlertType.ContractExpiring,
                Title = "Contrato Guarulhos vence em 45 dias",
                Description = "O contrato <strong>CT-2023-0142</strong> com a Prefeitura de Guarulhos vence em <strong>45 dias</strong>. Recomenda-se iniciar tratativas de renovação.",
                ClinicId = null,
                PrimaryActionLabel = "Ver contrato",
                SecondaryActionLabel = "Marcar como ciente",
                IsResolved = false,
                CreatedAt = now.AddDays(-1),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-035",
                Level = AlertLevel.Info, Type = AlertType.PendingConfirmation,
                Title = "2 confirmações de plantão pendentes",
                Description = "Dois médicos ainda não confirmaram presença nos turnos de <strong>14/05 e 15/05</strong>. Prazo de confirmação: amanhã.",
                ClinicId = ClinicAlphaId,
                PrimaryActionLabel = "Enviar lembrete",
                SecondaryActionLabel = "Ver escalas",
                IsResolved = false,
                CreatedAt = now.AddHours(-8),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-034",
                Level = AlertLevel.Resolved, Type = AlertType.UncoveredShift,
                Title = "Substituto designado — turno resolvido",
                Description = "Dr. Roberto Alves foi designado para cobrir o plantão da noite de <strong>09/05</strong> após ausência de Dra. Camila Ferraz. Turno garantido.",
                ClinicId = ClinicAlphaId,
                RelatedUserId = MedicoRobertoId,
                SecondaryActionLabel = "Ver substituição",
                IsResolved = true,
                ResolvedAt = now.AddHours(-2),
                ResolvedByUserId = AdminUserId,
                CreatedAt = now.AddHours(-3),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-033",
                Level = AlertLevel.Resolved, Type = AlertType.UnannouncedAbsence,
                Title = "Justificativa aceita — Dra. Jessica Lima",
                Description = "A justificativa de ausência de Dra. Jessica Lima referente ao dia <strong>07/05</strong> foi aprovada com atestado médico válido.",
                ClinicId = ClinicAlphaId,
                RelatedUserId = MedicoJessicaId,
                SecondaryActionLabel = "Ver justificativa",
                IsResolved = true,
                ResolvedAt = now.AddDays(-1).AddHours(-4),
                ResolvedByUserId = AdminUserId,
                CreatedAt = now.AddDays(-1).AddHours(-6),
            },
            new Alert
            {
                Id = Guid.NewGuid(), Code = "ALT-2026-032",
                Level = AlertLevel.Resolved, Type = AlertType.Delay,
                Title = "Ocorrência registrada — Dra. Camila Ferraz",
                Description = "O atraso de 45 min de Dra. Camila Ferraz em <strong>07/05</strong> foi formalmente registrado no histórico da profissional.",
                ClinicId = ClinicBetaId,
                RelatedUserId = MedicoCamilaId,
                SecondaryActionLabel = "Ver histórico",
                IsResolved = true,
                ResolvedAt = now.AddDays(-1).AddHours(-2),
                ResolvedByUserId = AdminUserId,
                CreatedAt = now.AddDays(-1).AddHours(-5),
            }
        );

        await _context.SaveChangesAsync();
    }
}
