using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Moq;
using PlantonHub.Application.DTOs.Clinics;
using PlantonHub.Infrastructure.Data;
using StackExchange.Redis;

namespace PlantonHub.IntegrationTests.Cache;

[Trait("Feature", "redis-cache-layer")]
public class CacheIntegrationTests : IClassFixture<CacheIntegrationTests.CacheTestFactory>, IDisposable
{
    private readonly CacheTestFactory _factory;
    private readonly HttpClient _client;

    public CacheIntegrationTests(CacheTestFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
    }

    /// <summary>
    /// Tests the full cache-aside flow:
    /// GET → cache miss → GET → cache hit → POST → cache invalidated → GET → fresh data
    /// Validates: Requirements 3.1, 3.2, 3.3
    /// </summary>
    [Fact]
    public async Task CacheAside_FullFlow_CacheMiss_CacheHit_Invalidation_FreshData()
    {
        // Arrange: set auth token for AdminGlobal
        var token = GenerateAdminGlobalToken();
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Act 1: First GET — cache miss, data comes from DB
        var response1 = await _client.GetAsync("/api/clinics");
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinics1 = await response1.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        clinics1.Should().NotBeNull();
        var initialCount = clinics1!.Count;

        // Act 2: Second GET — should come from cache (same data)
        var response2 = await _client.GetAsync("/api/clinics");
        response2.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinics2 = await response2.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        clinics2.Should().NotBeNull();
        clinics2!.Count.Should().Be(initialCount);

        // Act 3: POST — creates a new clinic, should invalidate cache
        var newClinic = new CreateClinicRequest
        {
            Name = "Clínica Integração Teste",
            Address = "Rua Teste, 123",
            Phone = "11999999999"
        };
        var postResponse = await _client.PostAsJsonAsync("/api/clinics", newClinic);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdClinic = await postResponse.Content.ReadFromJsonAsync<ClinicResponse>();
        createdClinic.Should().NotBeNull();
        createdClinic!.Name.Should().Be("Clínica Integração Teste");

        // Act 4: Third GET — cache was invalidated, should get fresh data including new clinic
        var response3 = await _client.GetAsync("/api/clinics");
        response3.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinics3 = await response3.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        clinics3.Should().NotBeNull();
        clinics3!.Count.Should().Be(initialCount + 1);
        clinics3.Should().Contain(c => c.Name == "Clínica Integração Teste");
    }

    /// <summary>
    /// Verifies that cache hit returns the same data without going to DB.
    /// GET → first call populates cache → second call returns identical data from cache.
    /// Validates: Requirements 3.1, 3.2
    /// </summary>
    [Fact]
    public async Task CacheAside_SecondGet_ReturnsCachedData()
    {
        // Arrange
        var token = GenerateAdminGlobalToken();
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Act: Two consecutive GETs
        var response1 = await _client.GetAsync("/api/clinics");
        var clinics1 = await response1.Content.ReadFromJsonAsync<List<ClinicResponse>>();

        var response2 = await _client.GetAsync("/api/clinics");
        var clinics2 = await response2.Content.ReadFromJsonAsync<List<ClinicResponse>>();

        // Assert: both should return 200 with the same data
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        response2.StatusCode.Should().Be(HttpStatusCode.OK);
        clinics1.Should().BeEquivalentTo(clinics2);
    }

    /// <summary>
    /// Verifies that cache is invalidated after POST and fresh data is returned.
    /// POST → GET returns newly added entity.
    /// Validates: Requirements 3.3
    /// </summary>
    [Fact]
    public async Task CacheAside_PostInvalidatesCache_SubsequentGetReturnsFreshData()
    {
        // Arrange
        var token = GenerateAdminGlobalToken();
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Populate cache
        await _client.GetAsync("/api/clinics");

        // Act: Create a new clinic
        var newClinic = new CreateClinicRequest
        {
            Name = $"Clínica Nova {Guid.NewGuid():N}",
            Address = "Rua Nova, 456",
            Phone = "11888888888"
        };
        var postResponse = await _client.PostAsJsonAsync("/api/clinics", newClinic);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        // Act: GET after POST
        var response = await _client.GetAsync("/api/clinics");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinics = await response.Content.ReadFromJsonAsync<List<ClinicResponse>>();

        // Assert: new clinic should be in the results
        clinics.Should().NotBeNull();
        clinics!.Should().Contain(c => c.Name == newClinic.Name);
    }

    private static string GenerateAdminGlobalToken()
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes("PlantonHubSuperSecretKeyForJwtTokenGeneration2024!"));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, "11111111-1111-1111-1111-111111111111"),
            new("clinicId", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            new("roles", "AdminGlobal"),
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

    public class CacheTestFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");

            builder.ConfigureServices(services =>
            {
                // Remove the real DbContext registration
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.RemoveAll<AppDbContext>();

                // Add in-memory database for testing
                services.AddDbContext<AppDbContext>(options =>
                    options.UseInMemoryDatabase($"CacheIntegrationTest_{Guid.NewGuid()}"));

                // Replace Redis distributed cache with in-memory distributed cache
                services.RemoveAll<IDistributedCache>();
                services.AddDistributedMemoryCache();

                // Replace IConnectionMultiplexer with a mock (for RemoveByPrefixAsync)
                services.RemoveAll<IConnectionMultiplexer>();
                var mockMultiplexer = CreateMockConnectionMultiplexer();
                services.AddSingleton(mockMultiplexer);

                // Configure JWT Bearer to use the legacy token handler for consistent claim mapping
                services.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>(
                    Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme,
                    options =>
                    {
                        options.MapInboundClaims = false;
                    });

                // Ensure database is seeded
                var sp = services.BuildServiceProvider();
                using var scope = sp.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.Database.EnsureCreated();
                SeedTestData(db);
            });
        }

        private static IConnectionMultiplexer CreateMockConnectionMultiplexer()
        {
            var mockDb = new Mock<IDatabase>();
            mockDb.Setup(d => d.KeyDeleteAsync(It.IsAny<RedisKey>(), It.IsAny<CommandFlags>()))
                  .ReturnsAsync(true);

            var mockServer = new Mock<IServer>();
            mockServer.Setup(s => s.KeysAsync(
                    It.IsAny<int>(),
                    It.IsAny<RedisValue>(),
                    It.IsAny<int>(),
                    It.IsAny<long>(),
                    It.IsAny<int>(),
                    It.IsAny<CommandFlags>()))
                .Returns(EmptyAsyncEnumerable());

            var mockMultiplexer = new Mock<IConnectionMultiplexer>();
            mockMultiplexer.Setup(m => m.GetDatabase(It.IsAny<int>(), It.IsAny<object>()))
                          .Returns(mockDb.Object);
            mockMultiplexer.Setup(m => m.GetEndPoints(It.IsAny<bool>()))
                          .Returns(new[] { new System.Net.DnsEndPoint("localhost", 6379) });
            mockMultiplexer.Setup(m => m.GetServer(It.IsAny<System.Net.EndPoint>(), It.IsAny<object>()))
                          .Returns(mockServer.Object);

            return mockMultiplexer.Object;
        }

        private static void SeedTestData(AppDbContext db)
        {
            if (db.Clinics.Any()) return;

            var now = DateTime.UtcNow;

            db.Clinics.AddRange(
                new PlantonHub.Domain.Entities.Clinic
                {
                    Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                    Name = "Clínica Alpha",
                    Address = "Rua Alpha, 100",
                    Phone = "11999990001",
                    IsActive = true,
                    CreatedAt = now
                },
                new PlantonHub.Domain.Entities.Clinic
                {
                    Id = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                    Name = "Clínica Beta",
                    Address = "Rua Beta, 200",
                    Phone = "11999990002",
                    IsActive = true,
                    CreatedAt = now
                });

            db.SaveChanges();
        }

#pragma warning disable CS1998
        private static async IAsyncEnumerable<RedisKey> EmptyAsyncEnumerable()
        {
            yield break;
        }
#pragma warning restore CS1998
    }
}
