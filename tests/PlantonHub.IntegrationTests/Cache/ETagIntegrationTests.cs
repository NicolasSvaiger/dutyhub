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
using PlantonHub.Infrastructure.Data;
using StackExchange.Redis;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

namespace PlantonHub.IntegrationTests.Cache;

/// <summary>
/// Integration tests for ETag and HTTP 304 Not Modified responses.
/// Tests the full ETag round-trip flow and verifies absence of cache headers on write operations.
/// Validates: Requirements 6.1, 6.2, 6.3, 6.4
/// </summary>
[Trait("Feature", "redis-cache-layer")]
[Trait("Category", "Testcontainers")]
public class ETagIntegrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private readonly RedisContainer _redisContainer;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    private static readonly Guid ClinicId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid UserId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public ETagIntegrationTests()
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

        // Migrate and seed database
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

    #region ETag Round-Trip Tests (Requirement 6.1, 6.2)

    /// <summary>
    /// Tests full ETag round-trip: GET → extract ETag → GET with If-None-Match → 304 Not Modified.
    /// Validates: Requirements 6.1, 6.2
    /// </summary>
    [Fact]
    public async Task GetClinics_ETagRoundTrip_Returns304WhenDataUnchanged()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Act 1: First GET — should return 200 with ETag header
        var response1 = await _client.GetAsync("/api/clinics");
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        response1.Headers.ETag.Should().NotBeNull("GET response should include ETag header");
        var etag = response1.Headers.ETag!.ToString();
        etag.Should().NotBeNullOrWhiteSpace();

        // Act 2: Second GET with If-None-Match — should return 304 Not Modified
        var request2 = new HttpRequestMessage(HttpMethod.Get, "/api/clinics");
        request2.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request2.Headers.IfNoneMatch.Add(new EntityTagHeaderValue(etag));

        var response2 = await _client.SendAsync(request2);
        response2.StatusCode.Should().Be(HttpStatusCode.NotModified);
    }

    /// <summary>
    /// Tests ETag round-trip for shifts endpoint.
    /// Validates: Requirements 6.1, 6.2
    /// </summary>
    [Fact]
    public async Task GetShifts_ETagRoundTrip_Returns304WhenDataUnchanged()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminClinica", clinicId: ClinicId);
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Act 1: First GET — should return 200 with ETag header
        var response1 = await _client.GetAsync("/api/shifts");
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        response1.Headers.ETag.Should().NotBeNull("GET /api/shifts response should include ETag header");
        var etag = response1.Headers.ETag!.ToString();

        // Act 2: Second GET with If-None-Match — should return 304 Not Modified
        var request2 = new HttpRequestMessage(HttpMethod.Get, "/api/shifts");
        request2.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request2.Headers.IfNoneMatch.Add(new EntityTagHeaderValue(etag));

        var response2 = await _client.SendAsync(request2);
        response2.StatusCode.Should().Be(HttpStatusCode.NotModified);
    }

    /// <summary>
    /// Tests that a different ETag value does NOT return 304.
    /// Validates: Requirement 6.2
    /// </summary>
    [Fact]
    public async Task GetClinics_DifferentETag_Returns200WithNewETag()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Act: GET with a fabricated/wrong If-None-Match value
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/clinics");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.IfNoneMatch.Add(new EntityTagHeaderValue("\"invalid-etag-value\""));

        var response = await _client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.ETag.Should().NotBeNull("response should include the current ETag");
    }

    /// <summary>
    /// Tests that after data changes, previous ETag returns 200 with new data.
    /// Validates: Requirements 6.1, 6.2
    /// </summary>
    [Fact]
    public async Task GetClinics_AfterDataChange_PreviousETagReturns200()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Act 1: GET to get initial ETag
        var response1 = await _client.GetAsync("/api/clinics");
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        var initialEtag = response1.Headers.ETag!.ToString();

        // Act 2: POST to change data
        var newClinic = new CreateClinicRequest
        {
            Name = "Clínica ETag Test",
            Address = "Rua ETag, 100",
            Phone = "11888888888"
        };
        var postResponse = await _client.PostAsJsonAsync("/api/clinics", newClinic);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        // Act 3: GET with old ETag — should return 200 (data has changed)
        var request3 = new HttpRequestMessage(HttpMethod.Get, "/api/clinics");
        request3.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request3.Headers.IfNoneMatch.Add(new EntityTagHeaderValue(initialEtag));

        var response3 = await _client.SendAsync(request3);
        response3.StatusCode.Should().Be(HttpStatusCode.OK,
            "data was modified, so the old ETag should not match");
        response3.Headers.ETag.Should().NotBeNull();
        response3.Headers.ETag!.ToString().Should().NotBe(initialEtag,
            "new ETag should differ after data changed");
    }

    #endregion

    #region Cache-Control Header Tests (Requirement 6.3)

    /// <summary>
    /// Tests that GET list responses include Cache-Control: private, max-age=60.
    /// Validates: Requirement 6.3
    /// </summary>
    [Fact]
    public async Task GetClinics_Response_IncludesCacheControlHeader()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Act
        var response = await _client.GetAsync("/api/clinics");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.CacheControl.Should().NotBeNull("GET list response should include Cache-Control");
        response.Headers.CacheControl!.Private.Should().BeTrue("Cache-Control should be private");
        response.Headers.CacheControl!.MaxAge.Should().Be(TimeSpan.FromSeconds(60),
            "max-age should be 60 seconds");
    }

    /// <summary>
    /// Tests that GET /api/shifts also includes Cache-Control header.
    /// Validates: Requirement 6.3
    /// </summary>
    [Fact]
    public async Task GetShifts_Response_IncludesCacheControlHeader()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminClinica", clinicId: ClinicId);
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Act
        var response = await _client.GetAsync("/api/shifts");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.CacheControl.Should().NotBeNull("GET list response should include Cache-Control");
        response.Headers.CacheControl!.Private.Should().BeTrue();
        response.Headers.CacheControl!.MaxAge.Should().Be(TimeSpan.FromSeconds(60));
    }

    #endregion

    #region No Cache Headers on Write Operations (Requirement 6.4)

    /// <summary>
    /// Tests that POST /api/clinics response does NOT include ETag or Cache-Control headers.
    /// Validates: Requirement 6.4
    /// </summary>
    [Fact]
    public async Task PostClinics_Response_DoesNotIncludeCacheHeaders()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminGlobal");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var newClinic = new CreateClinicRequest
        {
            Name = "Clínica Sem Cache Headers",
            Address = "Rua No-Cache, 200",
            Phone = "11666666666"
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/clinics", newClinic);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.ETag.Should().BeNull("POST response should NOT include ETag header");
        response.Headers.CacheControl.Should().BeNull("POST response should NOT include Cache-Control header");
    }

    /// <summary>
    /// Tests that POST /api/shifts response does NOT include ETag or Cache-Control headers.
    /// Validates: Requirement 6.4
    /// </summary>
    [Fact]
    public async Task PostShifts_Response_DoesNotIncludeCacheHeaders()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminClinica", clinicId: ClinicId);
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var newShift = new CreateShiftRequest
        {
            ClinicId = ClinicId,
            Title = "Plantão Sem Cache",
            Date = DateTime.UtcNow.Date.AddDays(10),
            StartTime = new TimeSpan(8, 0, 0),
            EndTime = new TimeSpan(14, 0, 0)
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/shifts", newShift);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.ETag.Should().BeNull("POST response should NOT include ETag header");
        response.Headers.CacheControl.Should().BeNull("POST response should NOT include Cache-Control header");
    }

    /// <summary>
    /// Tests that POST /api/shifts/{id}/assign response does NOT include ETag or Cache-Control headers.
    /// Validates: Requirement 6.4
    /// </summary>
    [Fact]
    public async Task PostShiftAssign_Response_DoesNotIncludeCacheHeaders()
    {
        // Arrange
        var token = GenerateToken(roles: "AdminClinica", clinicId: ClinicId);
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Create a shift first to get its ID
        var newShift = new CreateShiftRequest
        {
            ClinicId = ClinicId,
            Title = "Plantão Para Assign",
            Date = DateTime.UtcNow.Date.AddDays(15),
            StartTime = new TimeSpan(14, 0, 0),
            EndTime = new TimeSpan(20, 0, 0)
        };
        var createResponse = await _client.PostAsJsonAsync("/api/shifts", newShift);
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdShift = await createResponse.Content.ReadFromJsonAsync<ShiftResponse>();

        // Act: Assign a professional to the shift
        var assignRequest = new AssignShiftRequest { UserId = UserId };
        var response = await _client.PostAsJsonAsync($"/api/shifts/{createdShift!.Id}/assign", assignRequest);

        // Assert: POST response should not have cache headers
        response.Headers.ETag.Should().BeNull("POST assign response should NOT include ETag header");
        response.Headers.CacheControl.Should().BeNull("POST assign response should NOT include Cache-Control header");
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
