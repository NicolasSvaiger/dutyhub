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

        await _context.SaveChangesAsync();
    }
}
