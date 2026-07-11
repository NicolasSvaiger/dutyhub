using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PlantonHub.Domain.Entities;
using PlantonHub.Infrastructure.Data;
using StackExchange.Redis;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

namespace PlantonHub.IntegrationTests.Cache;

/// <summary>
/// Integration tests for the token blacklist feature.
/// Tests the full flow: login → logout → request with old token → 401 Unauthorized.
/// Validates: Requirements 7.1, 7.2, 7.3
/// </summary>
[Trait("Feature", "redis-cache-layer")]
[Trait("Category", "Testcontainers")]
public class TokenBlacklistIntegrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private readonly RedisContainer _redisContainer;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;
    private string _adminToken = null!;

    private static readonly Guid ClinicId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid UserId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public TokenBlacklistIntegrationTests()
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

                var redisConn = $"{_redisContainer.GetConnectionString()},allowAdmin=true";

                builder.UseSetting("ConnectionStrings:Redis", redisConn);

                builder.ConfigureServices(services =>
                {
                    // Replace DbContext with real PostgreSQL from Testcontainer
                    services.RemoveAll<DbContextOptions<AppDbContext>>();
                    services.RemoveAll<AppDbContext>();
                    services.AddDbContext<AppDbContext>(options =>
                        options.UseNpgsql(_postgresContainer.GetConnectionString()));

                    // Replace IConnectionMultiplexer with real Redis connection
                    services.RemoveAll<IConnectionMultiplexer>();
                    services.AddSingleton<IConnectionMultiplexer>(sp =>
                        ConnectionMultiplexer.Connect(redisConn));
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
        _adminToken = await Helpers.CognitoTestAuth.GetAdminTokenAsync();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _redisContainer.DisposeAsync();
        await _postgresContainer.DisposeAsync();
    }

    #region Token Blacklist Tests (Requirements 7.1, 7.2, 7.3)

    /// <summary>
    /// Tests the full token blacklist flow:
    /// Use token → logout (blacklists token) → use same token → 401 Unauthorized
    /// Validates: Requirements 7.1, 7.2, 7.3
    /// </summary>
    [Fact]
    public async Task TokenBlacklist_FullFlow_LogoutThenRequestWith401()
    {
        // Arrange: Use the admin token (has a real JTI from Cognito)
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _adminToken);

        // Extract JTI from the real Cognito token
        var jti = new JwtSecurityTokenHandler().ReadJwtToken(_adminToken)
            .Claims.First(c => c.Type == "jti").Value;

        // Flush Redis to ensure clean state
        await FlushRedis();

        // Act 1: Make a request with the token — should succeed (token is valid and not blacklisted)
        var response1 = await _client.GetAsync("/api/clinics");
        response1.StatusCode.Should().Be(HttpStatusCode.OK,
            "authenticated request with valid token should succeed");

        // Act 2: Logout — blacklists the current token's JTI in Redis
        var logoutResponse = await _client.PostAsync("/api/auth/logout", null);
        logoutResponse.StatusCode.Should().Be(HttpStatusCode.NoContent,
            "logout should return 204 No Content");

        // Verify the JTI was added to Redis blacklist
        var isBlacklisted = await VerifyRedisHasKey($"plantonhub:blacklist:{jti}");
        isBlacklisted.Should().BeTrue("logout should add the token's JTI to Redis blacklist");

        // Act 3: Make another request with the same (now blacklisted) token — should get 401
        var response2 = await _client.GetAsync("/api/clinics");
        response2.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            "request with blacklisted token should return 401 Unauthorized");
    }

    /// <summary>
    /// Tests that a token which has NOT been blacklisted continues to work normally.
    /// Validates: Requirements 7.2, 7.3
    /// </summary>
    [Fact]
    public async Task TokenBlacklist_NonBlacklistedToken_ContinuesWorking()
    {
        // Arrange: Use the admin token
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _adminToken);

        // Flush Redis to ensure clean state
        await FlushRedis();

        // Act: Make multiple requests — all should succeed since token is not blacklisted
        var response1 = await _client.GetAsync("/api/clinics");
        response1.StatusCode.Should().Be(HttpStatusCode.OK,
            "first request with non-blacklisted token should succeed");

        var response2 = await _client.GetAsync("/api/clinics");
        response2.StatusCode.Should().Be(HttpStatusCode.OK,
            "second request with non-blacklisted token should succeed");

        var response3 = await _client.GetAsync("/api/clinics");
        response3.StatusCode.Should().Be(HttpStatusCode.OK,
            "third request with non-blacklisted token should succeed");
    }

    /// <summary>
    /// Tests that blacklisting one token does not affect other tokens.
    /// Validates: Requirements 7.2, 7.3
    /// </summary>
    [Fact]
    public async Task TokenBlacklist_OnlyAffectsBlacklistedToken_OtherTokensWork()
    {
        // Arrange: Use admin token as the first token, medico token as the second
        var token1 = _adminToken;
        var token2 = await Helpers.CognitoTestAuth.GetMedicoTokenAsync();

        await FlushRedis();

        // Act 1: Logout with token1 — blacklists its JTI
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token1);
        var logoutResponse = await _client.PostAsync("/api/auth/logout", null);
        logoutResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Act 2: Use token1 — should be rejected (401)
        var responseWithToken1 = await _client.GetAsync("/api/clinics");
        responseWithToken1.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            "blacklisted token should be rejected");

        // Act 3: Use token2 — should still work (different JTI, not blacklisted)
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token2);
        var responseWithToken2 = await _client.GetAsync("/api/clinics");
        responseWithToken2.StatusCode.Should().Be(HttpStatusCode.OK,
            "a different token that was not blacklisted should continue working");
    }

    /// <summary>
    /// Tests that the logout endpoint stores the blacklist entry with TTL
    /// matching the remaining token expiration time.
    /// Validates: Requirements 7.1
    /// </summary>
    [Fact]
    public async Task TokenBlacklist_Logout_StoresWithCorrectTtl()
    {
        // Arrange: Use the admin token (Cognito tokens typically expire in 60 minutes)
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _adminToken);

        // Extract the JTI from the real Cognito token
        var jti = new JwtSecurityTokenHandler().ReadJwtToken(_adminToken)
            .Claims.First(c => c.Type == "jti").Value;

        await FlushRedis();

        // Act: Logout
        var logoutResponse = await _client.PostAsync("/api/auth/logout", null);
        logoutResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Assert: Check that the Redis key has a TTL set (not infinite)
        var ttl = await GetRedisKeyTtl($"plantonhub:blacklist:{jti}");
        ttl.Should().NotBeNull("blacklist entry should have a TTL");
        ttl!.Value.TotalMinutes.Should().BeGreaterThan(0, "TTL should be positive");
        ttl!.Value.TotalMinutes.Should().BeLessOrEqualTo(60, "TTL should not exceed token's remaining lifetime");
    }

    #endregion

    #region Helpers

    private async Task FlushRedis()
    {
        var connectionString = $"{_redisContainer.GetConnectionString()},allowAdmin=true";
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

    private async Task<TimeSpan?> GetRedisKeyTtl(string key)
    {
        var connectionString = _redisContainer.GetConnectionString();
        using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var db = redis.GetDatabase();
        var ttl = await db.KeyTimeToLiveAsync(key);
        return ttl;
    }

    private static void SeedTestData(AppDbContext db)
    {
        if (db.Clinics.Any()) return;

        var now = DateTime.UtcNow;

        // Seed clinics
        var clinic = new Clinic
        {
            Id = ClinicId,
            Name = "Clínica Alpha",
            Address = "Rua Alpha, 100",
            Phone = "11999990001",
            IsActive = true,
            CreatedAt = now
        };
        db.Clinics.Add(clinic);

        // Seed a user
        var user = new User
        {
            Id = UserId,
            Name = "Admin Global Teste",
            Email = "admin@plantonhub.com",
            PasswordHash = "hashed_password_placeholder",
            CreatedAt = now,
            UpdatedAt = now
        };
        db.Users.Add(user);

        db.SaveChanges();
    }

    #endregion
}
