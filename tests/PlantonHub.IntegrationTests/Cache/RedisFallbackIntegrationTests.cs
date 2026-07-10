using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using PlantonHub.Application.DTOs.Clinics;
using PlantonHub.Application.DTOs.Shifts;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Infrastructure.Data;
using StackExchange.Redis;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

namespace PlantonHub.IntegrationTests.Cache;

/// <summary>
/// Integration tests for Redis fallback behavior (fail-open strategy).
/// Starts Redis normally, seeds data, then STOPS Redis mid-test to verify
/// the API still functions correctly by falling back to PostgreSQL.
/// Validates: Requirements 2.4, 2.5
/// </summary>
[Trait("Feature", "redis-cache-layer")]
[Trait("Category", "Testcontainers")]
public class RedisFallbackIntegrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private readonly RedisContainer _redisContainer;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    private static readonly Guid ClinicId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid UserId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public RedisFallbackIntegrationTests()
    {
        _postgresContainer = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("plantonhub_test")
            .WithUsername("postgres")
            .WithPassword("postgres")
            .Build();

        _redisContainer = new RedisBuilder()
            .WithImage("redis:7-alpine")
            .Build();
    }

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();
        await _redisContainer.StartAsync();

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");

                builder.ConfigureServices(services =>
                {
                    // Replace DbContext with real PostgreSQL from Testcontainer
                    services.RemoveAll<DbContextOptions<AppDbContext>>();
                    services.RemoveAll<AppDbContext>();
                    services.AddDbContext<AppDbContext>(options =>
                        options.UseNpgsql(_postgresContainer.GetConnectionString()));

                    // Replace Redis distributed cache with real Redis from Testcontainer
                    services.RemoveAll<Microsoft.Extensions.Caching.Distributed.IDistributedCache>();
                    services.AddStackExchangeRedisCache(options =>
                    {
                        options.Configuration = _redisContainer.GetConnectionString();
                        options.InstanceName = "plantonhub:";
                    });

                    // Replace IConnectionMultiplexer with real Redis connection
                    services.RemoveAll<IConnectionMultiplexer>();
                    services.AddSingleton<IConnectionMultiplexer>(sp =>
                        ConnectionMultiplexer.Connect(_redisContainer.GetConnectionString()));

                    // Configure JWT Bearer for test tokens
                    services.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>(
                        "Local",
                        options =>
                        {
                            options.MapInboundClaims = false;
                        });
                });
            });

        // Access the factory's server to trigger host build, then migrate and seed
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.MigrateAsync();
            SeedTestData(db);
        }

        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _redisContainer.DisposeAsync();
        await _postgresContainer.DisposeAsync();
    }

    #region Fallback Tests — GET operations (Requirement 2.4)

    /// <summary>
    /// Tests that GET /api/clinics still works when Redis is unavailable,
    /// falling back to PostgreSQL as the data source.
    /// Validates: Requirement 2.4
    /// </summary>
    [Fact]
    public async Task GetClinics_WhenRedisUnavailable_FallsBackToPostgreSql()
    {
        // Arrange: Authenticate and verify system works with Redis
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // First request with Redis available — ensures data exists and cache is populated
        var responseWithRedis = await _client.GetAsync("/api/clinics");
        responseWithRedis.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinicsWithRedis = await responseWithRedis.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        clinicsWithRedis.Should().NotBeNull();
        clinicsWithRedis!.Count.Should().BeGreaterThan(0);

        // Act: Stop Redis container to simulate Redis unavailability
        await _redisContainer.StopAsync();

        // Assert: GET still works, data comes from PostgreSQL directly
        var responseWithoutRedis = await _client.GetAsync("/api/clinics");
        responseWithoutRedis.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinicsWithoutRedis = await responseWithoutRedis.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        clinicsWithoutRedis.Should().NotBeNull();
        clinicsWithoutRedis!.Count.Should().Be(clinicsWithRedis.Count);
    }

    /// <summary>
    /// Tests that GET /api/shifts still works when Redis is unavailable,
    /// falling back to PostgreSQL as the data source.
    /// Validates: Requirement 2.4
    /// </summary>
    [Fact]
    public async Task GetShifts_WhenRedisUnavailable_FallsBackToPostgreSql()
    {
        // Arrange: Authenticate
        var token = GenerateToken(roles: "AdminClinica", clinicId: ClinicId);
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // First request with Redis available
        var responseWithRedis = await _client.GetAsync("/api/shifts");
        responseWithRedis.StatusCode.Should().Be(HttpStatusCode.OK);
        var shiftsWithRedis = await responseWithRedis.Content.ReadFromJsonAsync<List<ShiftResponse>>();
        shiftsWithRedis.Should().NotBeNull();

        // Act: Stop Redis container
        await _redisContainer.StopAsync();

        // Assert: GET shifts still returns data from PostgreSQL
        var responseWithoutRedis = await _client.GetAsync("/api/shifts");
        responseWithoutRedis.StatusCode.Should().Be(HttpStatusCode.OK);
        var shiftsWithoutRedis = await responseWithoutRedis.Content.ReadFromJsonAsync<List<ShiftResponse>>();
        shiftsWithoutRedis.Should().NotBeNull();
        shiftsWithoutRedis!.Count.Should().Be(shiftsWithRedis!.Count);
    }

    #endregion

    #region Fallback Tests — Write operations (Requirement 2.5)

    /// <summary>
    /// Tests that POST /api/clinics (write operation) still succeeds when Redis is unavailable.
    /// The operation should complete normally with data persisted to PostgreSQL,
    /// even though cache write/invalidation fails silently.
    /// Validates: Requirement 2.5
    /// </summary>
    [Fact]
    public async Task CreateClinic_WhenRedisUnavailable_ProceedsNormally()
    {
        // Arrange: Authenticate
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Stop Redis container to simulate Redis unavailability
        await _redisContainer.StopAsync();

        // Act: Create a new clinic with Redis down
        var newClinic = new CreateClinicRequest
        {
            Name = "Clínica Fallback Test",
            Address = "Rua Sem Cache, 123",
            Phone = "11888888888"
        };
        var postResponse = await _client.PostAsJsonAsync("/api/clinics", newClinic);

        // Assert: Write operation succeeds (data persisted to PostgreSQL)
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdClinic = await postResponse.Content.ReadFromJsonAsync<ClinicResponse>();
        createdClinic.Should().NotBeNull();
        createdClinic!.Name.Should().Be("Clínica Fallback Test");

        // Verify: Data is actually in PostgreSQL by fetching it
        var getResponse = await _client.GetAsync("/api/clinics");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var allClinics = await getResponse.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        allClinics.Should().Contain(c => c.Name == "Clínica Fallback Test");
    }

    /// <summary>
    /// Tests that POST /api/shifts (write operation) still succeeds when Redis is unavailable.
    /// The shift is created in PostgreSQL and cache invalidation failure is swallowed.
    /// Validates: Requirement 2.5
    /// </summary>
    [Fact]
    public async Task CreateShift_WhenRedisUnavailable_ProceedsNormally()
    {
        // Arrange: Authenticate
        var token = GenerateToken(roles: "AdminClinica", clinicId: ClinicId);
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Stop Redis container
        await _redisContainer.StopAsync();

        // Act: Create a new shift with Redis down
        var newShift = new CreateShiftRequest
        {
            ClinicId = ClinicId,
            Title = "Plantão Sem Cache",
            Date = DateTime.UtcNow.Date.AddDays(14),
            StartTime = new TimeSpan(8, 0, 0),
            EndTime = new TimeSpan(14, 0, 0)
        };
        var postResponse = await _client.PostAsJsonAsync("/api/shifts", newShift);

        // Assert: Write operation succeeds
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdShift = await postResponse.Content.ReadFromJsonAsync<ShiftResponse>();
        createdShift.Should().NotBeNull();
        createdShift!.Title.Should().Be("Plantão Sem Cache");

        // Verify: Data is actually in PostgreSQL by fetching it
        var getResponse = await _client.GetAsync("/api/shifts");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var allShifts = await getResponse.Content.ReadFromJsonAsync<List<ShiftResponse>>();
        allShifts.Should().Contain(s => s.Title == "Plantão Sem Cache");
    }

    #endregion

    #region Fallback Tests — Token blacklist fail-open

    /// <summary>
    /// Tests that authenticated requests proceed normally when Redis is unavailable
    /// (fail-open strategy for token blacklist check).
    /// When Redis is down, the blacklist check fails gracefully and the request is allowed.
    /// Validates: Requirements 2.4, 2.5 (fail-open behavior)
    /// </summary>
    [Fact]
    public async Task AuthenticatedRequest_WhenRedisUnavailable_ProceedsWithFailOpen()
    {
        // Arrange: Use a token with a JTI (the middleware will try to check blacklist)
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Stop Redis container
        await _redisContainer.StopAsync();

        // Act: Make an authenticated request — the TokenBlacklistMiddleware should fail-open
        var response = await _client.GetAsync("/api/clinics");

        // Assert: Request proceeds normally despite Redis being down
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    #endregion

    #region Helpers

    private static string GenerateToken(string roles, Guid? clinicId = null, Guid? userId = null)
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes("PlantonHubSuperSecretKeyForJwtTokenGeneration2024!"));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, (userId ?? UserId).ToString()),
            new("clinicId", (clinicId ?? ClinicId).ToString()),
            new("roles", roles),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: "PlantonHub",
            audience: "PlantonHubUsers",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(60),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static void SeedTestData(AppDbContext db)
    {
        if (db.Clinics.Any()) return;

        var now = DateTime.UtcNow;

        // Seed clinics
        var clinicAlpha = new Clinic
        {
            Id = ClinicId,
            Name = "Clínica Alpha",
            Address = "Rua Alpha, 100",
            Phone = "11999990001",
            IsActive = true,
            CreatedAt = now
        };

        var clinicBeta = new Clinic
        {
            Id = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
            Name = "Clínica Beta",
            Address = "Rua Beta, 200",
            Phone = "11999990002",
            IsActive = true,
            CreatedAt = now
        };

        db.Clinics.AddRange(clinicAlpha, clinicBeta);

        // Seed a user
        var user = new User
        {
            Id = UserId,
            Name = "Admin Global Teste",
            Email = "admin@plantonhub.test",
            PasswordHash = "hashed_password_placeholder",
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Users.Add(user);

        // Seed a shift in clinicAlpha
        var shift = new Shift
        {
            Id = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"),
            ClinicId = ClinicId,
            Title = "Plantão Matutino Seed",
            Date = now.Date.AddDays(1),
            StartTime = new TimeSpan(7, 0, 0),
            EndTime = new TimeSpan(13, 0, 0),
            CreatedAt = now
        };
        db.Shifts.Add(shift);

        db.SaveChanges();
    }

    #endregion
}
