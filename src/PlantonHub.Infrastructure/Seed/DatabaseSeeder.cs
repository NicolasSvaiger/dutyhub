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
            UpdatedAt = now
        };

        var enfermeiroUser = new User
        {
            Id = EnfermeiroUserId,
            Email = "enfermeiro@plantonhub.com",
            Name = "Enfermeiro Teste",
            PasswordHash = _passwordHashService.HashPassword("Teste@123"),
            CreatedAt = now,
            UpdatedAt = now
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
    }
}
