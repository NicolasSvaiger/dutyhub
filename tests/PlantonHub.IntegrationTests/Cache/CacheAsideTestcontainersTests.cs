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
using PlantonHub.Application.DTOs.Users;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Infrastructure.Data;
using StackExchange.Redis;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

namespace PlantonHub.IntegrationTests.Cache;

/// <summary>
/// Integration tests for cache-aside pattern using Testcontainers with real Redis and PostgreSQL.
/// Tests the full flow: GET → cache miss → GET → cache hit → POST → cache invalidated → GET → fresh data.
/// Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3
/// </summary>
[Trait("Feature", "redis-cache-layer")]
[Trait("Category", "Testcontainers")]
public class CacheAsideTestcontainersTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private readonly RedisContainer _redisContainer;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    private static readonly Guid ClinicId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid UserId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public CacheAsideTestcontainersTests()
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
                        Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme,
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

    #region Clinic Cache-Aside Tests (Requirements 3.1, 3.2, 3.3)

    /// <summary>
    /// Tests the full cache-aside flow for clinics:
    /// GET → cache miss (data from DB) → GET → cache hit (data from Redis) → POST → cache invalidated → GET → fresh data from DB
    /// Validates: Requirements 3.1, 3.2, 3.3
    /// </summary>
    [Fact]
    public async Task Clinics_CacheAside_FullFlow_MissHitInvalidateFresh()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Flush Redis to ensure clean state
        await FlushRedis();

        // Act 1: First GET — cache miss, data fetched from PostgreSQL
        var response1 = await _client.GetAsync("/api/clinics");
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinics1 = await response1.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        clinics1.Should().NotBeNull();
        var initialCount = clinics1!.Count;
        initialCount.Should().BeGreaterThan(0, "seeded clinics should exist");

        // Verify data is now stored in Redis
        var redisHasData = await VerifyRedisHasKey("plantonhub:plantonhub:clinics:all");
        redisHasData.Should().BeTrue("first GET should populate the Redis cache");

        // Act 2: Second GET — cache hit, data comes from Redis (same data, no DB query needed)
        var response2 = await _client.GetAsync("/api/clinics");
        response2.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinics2 = await response2.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        clinics2.Should().NotBeNull();
        clinics2!.Count.Should().Be(initialCount);
        clinics2.Should().BeEquivalentTo(clinics1);

        // Act 3: POST — creates a new clinic, should invalidate cache
        var newClinic = new CreateClinicRequest
        {
            Name = "Clínica Testcontainers",
            Address = "Rua Container, 456",
            Phone = "11777777777"
        };
        var postResponse = await _client.PostAsJsonAsync("/api/clinics", newClinic);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdClinic = await postResponse.Content.ReadFromJsonAsync<ClinicResponse>();
        createdClinic.Should().NotBeNull();
        createdClinic!.Name.Should().Be("Clínica Testcontainers");

        // Verify cache was invalidated (key no longer exists in Redis)
        var redisHasDataAfterPost = await VerifyRedisHasKey("plantonhub:plantonhub:clinics:all");
        redisHasDataAfterPost.Should().BeFalse("POST should invalidate clinic cache entries");

        // Act 4: Third GET — cache was invalidated, fresh data from DB including new clinic
        var response3 = await _client.GetAsync("/api/clinics");
        response3.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinics3 = await response3.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        clinics3.Should().NotBeNull();
        clinics3!.Count.Should().Be(initialCount + 1);
        clinics3.Should().Contain(c => c.Name == "Clínica Testcontainers");
    }

    /// <summary>
    /// Verifies consecutive GETs return cached data (cache hit).
    /// Validates: Requirements 3.1, 3.2
    /// </summary>
    [Fact]
    public async Task Clinics_ConsecutiveGets_ReturnCachedData()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        await FlushRedis();

        // Act: First GET populates cache
        var response1 = await _client.GetAsync("/api/clinics");
        var clinics1 = await response1.Content.ReadFromJsonAsync<List<ClinicResponse>>();

        // Act: Second GET returns cached data
        var response2 = await _client.GetAsync("/api/clinics");
        var clinics2 = await response2.Content.ReadFromJsonAsync<List<ClinicResponse>>();

        // Assert
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        response2.StatusCode.Should().Be(HttpStatusCode.OK);
        clinics1.Should().BeEquivalentTo(clinics2);
    }

    #endregion

    #region Shift Cache-Aside Tests (Requirements 4.1, 4.2, 4.3)

    /// <summary>
    /// Tests the full cache-aside flow for shifts:
    /// GET → cache miss → GET → cache hit → POST → cache invalidated → GET → fresh data
    /// Validates: Requirements 4.1, 4.2, 4.3
    /// </summary>
    [Fact]
    public async Task Shifts_CacheAside_FullFlow_MissHitInvalidateFresh()
    {
        // Arrange: Use AdminClinica token scoped to the test clinic
        var token = GenerateToken(roles: "AdminClinica", clinicId: ClinicId);
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        await FlushRedis();

        // Act 1: First GET — cache miss, data fetched from PostgreSQL
        var response1 = await _client.GetAsync("/api/shifts");
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        var shifts1 = await response1.Content.ReadFromJsonAsync<List<ShiftResponse>>();
        shifts1.Should().NotBeNull();
        var initialCount = shifts1!.Count;

        // Act 2: Second GET — cache hit
        var response2 = await _client.GetAsync("/api/shifts");
        response2.StatusCode.Should().Be(HttpStatusCode.OK);
        var shifts2 = await response2.Content.ReadFromJsonAsync<List<ShiftResponse>>();
        shifts2.Should().NotBeNull();
        shifts2!.Count.Should().Be(initialCount);

        // Act 3: POST — creates a new shift, should invalidate cache
        var newShift = new CreateShiftRequest
        {
            ClinicId = ClinicId,
            Title = "Plantão Noturno Testcontainers",
            Date = DateTime.UtcNow.Date.AddDays(7),
            StartTime = new TimeSpan(22, 0, 0),
            EndTime = new TimeSpan(6, 0, 0)
        };
        var postResponse = await _client.PostAsJsonAsync("/api/shifts", newShift);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdShift = await postResponse.Content.ReadFromJsonAsync<ShiftResponse>();
        createdShift.Should().NotBeNull();
        createdShift!.Title.Should().Be("Plantão Noturno Testcontainers");

        // Act 4: GET after POST — cache invalidated, fresh data includes new shift
        var response3 = await _client.GetAsync("/api/shifts");
        response3.StatusCode.Should().Be(HttpStatusCode.OK);
        var shifts3 = await response3.Content.ReadFromJsonAsync<List<ShiftResponse>>();
        shifts3.Should().NotBeNull();
        shifts3!.Count.Should().Be(initialCount + 1);
        shifts3.Should().Contain(s => s.Title == "Plantão Noturno Testcontainers");
    }

    /// <summary>
    /// Verifies consecutive shift GETs return cached data.
    /// Validates: Requirements 4.1, 4.2
    /// </summary>
    [Fact]
    public async Task Shifts_ConsecutiveGets_ReturnCachedData()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminClinica", clinicId: ClinicId);
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        await FlushRedis();

        // Act
        var response1 = await _client.GetAsync("/api/shifts");
        var shifts1 = await response1.Content.ReadFromJsonAsync<List<ShiftResponse>>();

        var response2 = await _client.GetAsync("/api/shifts");
        var shifts2 = await response2.Content.ReadFromJsonAsync<List<ShiftResponse>>();

        // Assert
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        response2.StatusCode.Should().Be(HttpStatusCode.OK);
        shifts1.Should().BeEquivalentTo(shifts2);
    }

    #endregion

    #region User Profile Cache-Aside Tests (Requirements 5.1, 5.2, 5.3)

    /// <summary>
    /// Tests cache-aside for user profiles:
    /// GET /api/users/{id} → cache miss → GET → cache hit → POST (assign role) → cache invalidated → GET → fresh data
    /// Validates: Requirements 5.1, 5.2, 5.3
    /// </summary>
    [Fact]
    public async Task UserProfile_CacheAside_FullFlow_MissHitInvalidateFresh()
    {
        // Arrange: Use AdminGlobal token
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        await FlushRedis();

        // Act 1: First GET by ID — cache miss, data from PostgreSQL
        var response1 = await _client.GetAsync($"/api/users/{UserId}");
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        var user1 = await response1.Content.ReadFromJsonAsync<UserResponse>();
        user1.Should().NotBeNull();
        user1!.Id.Should().Be(UserId);

        // Verify cache is populated
        var cacheKey = $"plantonhub:plantonhub:users:profile:{UserId}";
        var hasCache = await VerifyRedisHasKey(cacheKey);
        hasCache.Should().BeTrue("first GET should populate user profile cache");

        // Act 2: Second GET — cache hit
        var response2 = await _client.GetAsync($"/api/users/{UserId}");
        response2.StatusCode.Should().Be(HttpStatusCode.OK);
        var user2 = await response2.Content.ReadFromJsonAsync<UserResponse>();
        user2.Should().NotBeNull();
        user2.Should().BeEquivalentTo(user1);

        // Act 3: Assign a clinic role — should invalidate user profile cache
        var assignRequest = new AssignRoleRequest
        {
            ClinicId = ClinicId,
            Role = RoleType.Medico
        };
        var assignResponse = await _client.PostAsJsonAsync($"/api/users/{UserId}/clinic-role", assignRequest);
        assignResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        // Verify cache was invalidated
        var hasCacheAfterAssign = await VerifyRedisHasKey(cacheKey);
        hasCacheAfterAssign.Should().BeFalse("assigning a role should invalidate user profile cache");

        // Act 4: GET after role assignment — fresh data from DB
        var response3 = await _client.GetAsync($"/api/users/{UserId}");
        response3.StatusCode.Should().Be(HttpStatusCode.OK);
        var user3 = await response3.Content.ReadFromJsonAsync<UserResponse>();
        user3.Should().NotBeNull();
        user3!.Id.Should().Be(UserId);
    }

    /// <summary>
    /// Verifies creating a new user invalidates user cache.
    /// Validates: Requirements 5.3
    /// </summary>
    [Fact]
    public async Task UserProfile_CreateUser_InvalidatesCache()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        await FlushRedis();

        // Populate cache by fetching existing user
        await _client.GetAsync($"/api/users/{UserId}");
        var hasCache = await VerifyRedisHasKey($"plantonhub:plantonhub:users:profile:{UserId}");
        hasCache.Should().BeTrue();

        // Act: Create a new user (invalidates users: prefix)
        var newUser = new CreateUserRequest
        {
            Name = "Novo Usuário Teste",
            Email = $"novo.usuario.{Guid.NewGuid():N}@test.com",
            Password = "Senha@123"
        };
        var postResponse = await _client.PostAsJsonAsync("/api/users", newUser);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        // Assert: user profile cache was invalidated
        var hasCacheAfter = await VerifyRedisHasKey($"plantonhub:plantonhub:users:profile:{UserId}");
        hasCacheAfter.Should().BeFalse("creating a user should invalidate users cache prefix");
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

    private async Task FlushRedis()
    {
        var connectionString = _redisContainer.GetConnectionString();
        using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var server = redis.GetServer(redis.GetEndPoints().First());
        await server.FlushAllDatabasesAsync();
    }

    private async Task<bool> VerifyRedisHasKey(string key)
    {
        var connectionString = _redisContainer.GetConnectionString();
        using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var db = redis.GetDatabase();
        return await db.KeyExistsAsync(key);
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
