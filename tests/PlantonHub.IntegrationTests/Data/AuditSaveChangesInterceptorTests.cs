using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Infrastructure.Data;
using System.Security.Claims;
using System.Text.Json;
using Testcontainers.PostgreSql;

namespace PlantonHub.IntegrationTests.Data;

/// <summary>
/// Verifica que o AuditSaveChangesInterceptor captura corretamente as mutações
/// nas entidades whitelisted, atribui autoria ao usuário do HttpContext, e não
/// vaza campos sensíveis (PasswordHash, Embedding).
///
/// Usa Postgres real via Testcontainers — o interceptor grava na mesma transação
/// que a mutação, então esse teste também exercita a garantia atomica.
/// </summary>
[Trait("Feature", "audit-interceptor")]
[Trait("Category", "Testcontainers")]
public class AuditSaveChangesInterceptorTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres;
    private AppDbContext _context = null!;
    private Mock<IHttpContextAccessor> _httpContext = null!;

    private static readonly Guid CallerUserId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public AuditSaveChangesInterceptorTests()
    {
        _postgres = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("plantonhub_interceptor_test")
            .WithUsername("postgres")
            .WithPassword("postgres")
            .Build();
    }

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        // HttpContext simulado com um "sub" válido — mesma resolução usada em produção.
        _httpContext = new Mock<IHttpContextAccessor>();
        var ctx = new DefaultHttpContext();
        ctx.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim("sub", CallerUserId.ToString()),
        }, "TestAuth"));
        _httpContext.Setup(a => a.HttpContext).Returns(ctx);

        var interceptor = new AuditSaveChangesInterceptor(_httpContext.Object);

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(_postgres.GetConnectionString())
            .AddInterceptors(interceptor)
            .Options;

        _context = new AppDbContext(options);
        await _context.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        await _context.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    [Fact]
    public async Task Create_AuditedEntity_ProducesAuditLogInSameTransaction()
    {
        var user = MakeUser();

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var logs = await _context.AuditLogs.AsNoTracking().ToListAsync();
        logs.Should().ContainSingle();

        var log = logs[0];
        log.Operation.Should().Be("Create");
        log.Entity.Should().Be(nameof(User));
        log.EntityId.Should().Be(user.Id.ToString());
        log.Module.Should().Be("Usuários");
        log.UserId.Should().Be(CallerUserId);
        log.BeforeValue.Should().BeNull();
        log.AfterValue.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Update_AuditedEntity_CapturesBeforeAndAfterSnapshots()
    {
        var user = MakeUser();
        var originalName = user.Name;
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        user.Name = "New Name";
        await _context.SaveChangesAsync();

        var updateLog = await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.Operation == "Update")
            .SingleAsync();

        updateLog.BeforeValue.Should().NotBeNullOrEmpty();
        updateLog.AfterValue.Should().NotBeNullOrEmpty();

        using var before = JsonDocument.Parse(updateLog.BeforeValue!);
        using var after = JsonDocument.Parse(updateLog.AfterValue!);
        before.RootElement.GetProperty("Name").GetString().Should().Be(originalName);
        after.RootElement.GetProperty("Name").GetString().Should().Be("New Name");
    }

    [Fact]
    public async Task Delete_AuditedEntity_LogsBeforeOnly()
    {
        var user = MakeUser();
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        _context.Users.Remove(user);
        await _context.SaveChangesAsync();

        var deleteLog = await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.Operation == "Delete")
            .SingleAsync();

        deleteLog.BeforeValue.Should().NotBeNullOrEmpty();
        deleteLog.AfterValue.Should().BeNull();
    }

    [Fact]
    public async Task Create_UserWithPasswordHash_DoesNotLeakHashIntoAudit()
    {
        var user = MakeUser();
        user.PasswordHash = "super-secret-bcrypt-hash-abc123";

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var log = await _context.AuditLogs.AsNoTracking().SingleAsync();
        log.AfterValue.Should().NotBeNullOrEmpty();
        log.AfterValue!.Should().NotContain("super-secret-bcrypt-hash");
        log.AfterValue.Should().NotContain("PasswordHash");
    }

    [Fact]
    public async Task Create_FaceEnrollment_DoesNotLeakEmbeddingIntoAudit()
    {
        var user = MakeUser();
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var enrollment = new FaceEnrollment
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Embedding = new float[128], // dummy 128-dim vector
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };
        _context.FaceEnrollments.Add(enrollment);
        await _context.SaveChangesAsync();

        var log = await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.Entity == nameof(FaceEnrollment))
            .SingleAsync();

        log.Module.Should().Be("Biometria");
        log.AfterValue.Should().NotBeNullOrEmpty();
        log.AfterValue!.Should().NotContain("Embedding");
    }

    [Fact]
    public async Task Save_WithoutHttpContext_SkipsAuditing()
    {
        _httpContext.Setup(a => a.HttpContext).Returns((HttpContext?)null);

        var user = MakeUser();
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var logs = await _context.AuditLogs.AsNoTracking().ToListAsync();
        logs.Should().BeEmpty();
    }

    [Fact]
    public async Task Save_HighVolumeIgnoredEntity_DoesNotProduceAudit()
    {
        // Attendance é omitido do whitelist — muito alto volume, e o próprio
        // fluxo já produz OfflineSyncAuditLog quando relevante.
        var user = MakeUser();
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var clinic = new Clinic
        {
            Id = Guid.NewGuid(), Name = "C", Address = "A", Phone = "1",
            IsActive = true, CreatedAt = DateTime.UtcNow,
        };
        _context.Clinics.Add(clinic);
        await _context.SaveChangesAsync();

        var shift = new Shift
        {
            Id = Guid.NewGuid(), ClinicId = clinic.Id, Title = "M",
            Date = DateTime.UtcNow.Date, StartTime = TimeSpan.FromHours(7),
            EndTime = TimeSpan.FromHours(19), CreatedAt = DateTime.UtcNow,
        };
        _context.Shifts.Add(shift);
        await _context.SaveChangesAsync();

        var attendance = new Attendance
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            ShiftId = shift.Id,
            ClinicId = clinic.Id,
            CheckInTime = DateTime.UtcNow,
            CheckInDeviceId = "dev",
        };
        _context.Attendances.Add(attendance);
        await _context.SaveChangesAsync();

        var attendanceLogs = await _context.AuditLogs
            .AsNoTracking()
            .Where(a => a.Entity == nameof(Attendance))
            .ToListAsync();

        attendanceLogs.Should().BeEmpty();
    }

    private static User MakeUser() => new()
    {
        Id = Guid.NewGuid(),
        Email = $"user-{Guid.NewGuid()}@test.com",
        Name = $"User {Guid.NewGuid():N}",
        PasswordHash = "hash",
        IsActive = true,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };
}
