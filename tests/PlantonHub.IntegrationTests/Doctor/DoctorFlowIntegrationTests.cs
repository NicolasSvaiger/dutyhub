using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using PlantonHub.Application.DTOs.Attendance;
using PlantonHub.Application.DTOs.Clinics;
using PlantonHub.Application.DTOs.Shifts;
using PlantonHub.Domain.Entities;
using PlantonHub.Domain.Enums;
using PlantonHub.Infrastructure.Data;
using StackExchange.Redis;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

namespace PlantonHub.IntegrationTests.Doctor;

/// <summary>
/// Integration tests do fluxo do médico ponta-a-ponta contra HTTP real:
///   • Multi-clínica: token com clinicIds, listagem de clínicas, X-Clinic-Id switching
///   • Plantões: /shifts/me/today filtra por clínica ativa; /shifts/me agrega
///   • Regra "um plantão ativo por vez" — inclusive cross-clinic
///   • /attendance/active devolve ativos em qualquer clínica autorizada
///
/// Usa Postgres + Redis reais via Testcontainers; a API é levantada com
/// WebApplicationFactory pra rodar exatamente o mesmo pipeline HTTP.
/// </summary>
[Trait("Feature", "doctor-multi-clinic")]
[Trait("Category", "Testcontainers")]
public class DoctorFlowIntegrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer;
    private readonly RedisContainer _redisContainer;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    // GUIDs fixos pra manter os testes previsíveis e permitir asserts precisos.
    private static readonly Guid MedicoUserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid AlphaClinicId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid BetaClinicId  = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid AlphaShiftId  = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccc01");
    private static readonly Guid BetaShiftId   = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccc02");
    private static readonly Guid UnrelatedClinicId = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");

    private const string JwtSecret = "PlantonHubSuperSecretKeyForJwtTokenGeneration2024!";

    public DoctorFlowIntegrationTests()
    {
        _postgresContainer = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("plantonhub_doctor_test")
            .WithUsername("postgres")
            .WithPassword("postgres")
            .Build();

        _redisContainer = new RedisBuilder().WithImage("redis:7-alpine").Build();
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
                    services.RemoveAll<DbContextOptions<AppDbContext>>();
                    services.RemoveAll<AppDbContext>();
                    services.AddDbContext<AppDbContext>(options =>
                        options.UseNpgsql(_postgresContainer.GetConnectionString()));

                    services.RemoveAll<Microsoft.Extensions.Caching.Distributed.IDistributedCache>();
                    services.AddStackExchangeRedisCache(options =>
                    {
                        options.Configuration = _redisContainer.GetConnectionString();
                        options.InstanceName = "plantonhub:";
                    });

                    services.RemoveAll<IConnectionMultiplexer>();
                    services.AddSingleton<IConnectionMultiplexer>(_ =>
                        ConnectionMultiplexer.Connect(_redisContainer.GetConnectionString()));

                    services.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>(
                        Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme,
                        options => options.MapInboundClaims = false);
                });
            });

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

    // ─────────────────────────────────────────────────────────────
    // LOGIN + CLAIMS
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Login_ForMultiClinicMedico_ReturnsTokenWithNameEmailAndClinicIds()
    {
        var loginResponse = await _client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "medico@test.com",
            password = "Teste@123",
        });

        loginResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await loginResponse.Content.ReadFromJsonAsync<JsonElement>();
        var token = body.GetProperty("token").GetString()!;
        token.Should().NotBeNullOrEmpty();

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        jwt.Claims.Should().Contain(c => c.Type == JwtRegisteredClaimNames.Email && c.Value == "medico@test.com");
        jwt.Claims.Should().Contain(c => c.Type == "name" && c.Value == "Dr. Médico Teste");

        var clinicIdsRaw = jwt.Claims.Single(c => c.Type == "clinicIds").Value;
        var clinicIds = clinicIdsRaw.Split(',');
        clinicIds.Should().HaveCount(2);
        clinicIds.Should().Contain(AlphaClinicId.ToString());
        clinicIds.Should().Contain(BetaClinicId.ToString());
    }

    // ─────────────────────────────────────────────────────────────
    // GET /clinics — retorna todas autorizadas
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetClinics_AsMedico_ReturnsBothAuthorizedClinics()
    {
        AuthAsMedico(activeClinicId: AlphaClinicId);

        var response = await _client.GetAsync("/api/clinics");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinics = await response.Content.ReadFromJsonAsync<List<ClinicResponse>>();
        clinics.Should().NotBeNull().And.HaveCount(2);
        clinics!.Select(c => c.Id).Should().Contain(new[] { AlphaClinicId, BetaClinicId });
    }

    // ─────────────────────────────────────────────────────────────
    // /shifts/me/today — filtra pela clínica ativa (header)
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyTodayShifts_WithAlphaHeader_ReturnsOnlyAlphaShift()
    {
        AuthAsMedico();

        var response = await GetWithClinic("/api/shifts/me/today", AlphaClinicId);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var shifts = await response.Content.ReadFromJsonAsync<List<ShiftResponse>>();
        shifts.Should().ContainSingle();
        shifts![0].ClinicId.Should().Be(AlphaClinicId);
    }

    [Fact]
    public async Task GetMyTodayShifts_SwitchingHeaderReturnsCorrectClinicShift()
    {
        AuthAsMedico();

        var alphaResponse = await GetWithClinic("/api/shifts/me/today", AlphaClinicId);
        var betaResponse  = await GetWithClinic("/api/shifts/me/today", BetaClinicId);

        (await alphaResponse.Content.ReadFromJsonAsync<List<ShiftResponse>>())!
            .Should().ContainSingle().Which.ClinicId.Should().Be(AlphaClinicId);

        (await betaResponse.Content.ReadFromJsonAsync<List<ShiftResponse>>())!
            .Should().ContainSingle().Which.ClinicId.Should().Be(BetaClinicId);
    }

    [Fact]
    public async Task GetMyTodayShifts_WithUnauthorizedClinicHeader_ReturnsEmpty()
    {
        // O TenantService rejeita silenciosamente clínica não autorizada;
        // resultado é lista vazia (sem 500, sem 403).
        AuthAsMedico();

        var response = await GetWithClinic("/api/shifts/me/today", UnrelatedClinicId);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var shifts = await response.Content.ReadFromJsonAsync<List<ShiftResponse>>();
        shifts.Should().BeEmpty();
    }

    // ─────────────────────────────────────────────────────────────
    // /shifts/me — agrega todas as clínicas autorizadas
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyShifts_AggregatesShiftsAcrossAllAuthorizedClinics()
    {
        AuthAsMedico(activeClinicId: AlphaClinicId);

        var response = await _client.GetAsync("/api/shifts/me");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var shifts = await response.Content.ReadFromJsonAsync<List<ShiftResponse>>();
        shifts.Should().NotBeNull().And.HaveCountGreaterOrEqualTo(2);
        shifts!.Select(s => s.ClinicId).Should().Contain(new[] { AlphaClinicId, BetaClinicId });
    }

    // ─────────────────────────────────────────────────────────────
    // Regra de negócio: "um plantão ativo por vez"
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task CheckIn_WithNoActiveExists_Returns201Created()
    {
        AuthAsMedico(activeClinicId: AlphaClinicId);

        var response = await _client.PostAsJsonAsync("/api/attendance/check-in", CheckInPayload(AlphaShiftId));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var att = await response.Content.ReadFromJsonAsync<AttendanceResponse>();
        att!.ShiftId.Should().Be(AlphaShiftId);
        att.ClinicId.Should().Be(AlphaClinicId);
        att.CheckOutTime.Should().BeNull();
    }

    [Fact]
    public async Task CheckIn_TwiceOnSameShift_SecondReturns409Conflict()
    {
        AuthAsMedico(activeClinicId: AlphaClinicId);

        var first = await _client.PostAsJsonAsync("/api/attendance/check-in", CheckInPayload(AlphaShiftId));
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        var second = await _client.PostAsJsonAsync("/api/attendance/check-in", CheckInPayload(AlphaShiftId));

        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task CheckIn_WhenActiveExistsInDifferentClinic_Returns409Conflict()
    {
        // Regra crítica: profissional só pode estar em UM plantão por vez, mesmo
        // que os plantões sejam em clínicas diferentes.
        AuthAsMedico();

        var alphaResponse = await PostWithClinic("/api/attendance/check-in", AlphaClinicId, CheckInPayload(AlphaShiftId));
        alphaResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        // Tenta abrir um segundo check-in em outra clínica
        var betaResponse = await PostWithClinic("/api/attendance/check-in", BetaClinicId, CheckInPayload(BetaShiftId));

        betaResponse.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    // ─────────────────────────────────────────────────────────────
    // /attendance/active — cross-clinic
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyActive_ReturnsActiveCheckInAcrossAllClinics()
    {
        AuthAsMedico();

        // Check-in na Alpha
        var checkIn = await PostWithClinic("/api/attendance/check-in", AlphaClinicId, CheckInPayload(AlphaShiftId));
        checkIn.StatusCode.Should().Be(HttpStatusCode.Created);

        // Consulta ativos com header apontando pra BETA — deve mesmo assim
        // trazer o check-in da Alpha (varre todas autorizadas).
        var response = await GetWithClinic("/api/attendance/active", BetaClinicId);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var actives = await response.Content.ReadFromJsonAsync<List<AttendanceResponse>>();
        actives.Should().ContainSingle();
        actives![0].ClinicId.Should().Be(AlphaClinicId);
        actives[0].ShiftId.Should().Be(AlphaShiftId);
    }

    // ─────────────────────────────────────────────────────────────
    // /attendance/my-history — cross-clinic (regressão do bug reportado)
    // ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetMyHistory_ReturnsAttendancesAcrossAllAuthorizedClinics()
    {
        // Bug histórico: /my-history filtrava só pela clínica no header,
        // então quem fizesse check-in em Beta com header apontando pra Alpha
        // via a tela "Presença" vazia. Agora agrega todas as autorizadas.
        AuthAsMedico();

        var checkInBeta = await PostWithClinic(
            "/api/attendance/check-in",
            BetaClinicId,
            CheckInPayload(BetaShiftId));
        checkInBeta.StatusCode.Should().Be(HttpStatusCode.Created);

        // Consulta o histórico com header apontando pra ALPHA
        var response = await GetWithClinic("/api/attendance/my-history", AlphaClinicId);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var history = await response.Content.ReadFromJsonAsync<List<AttendanceResponse>>();
        history.Should().ContainSingle(
            "check-in feito em Beta deve aparecer mesmo com header apontando pra Alpha");
        history![0].ClinicId.Should().Be(BetaClinicId);
        history[0].ShiftId.Should().Be(BetaShiftId);
    }

    [Fact]
    public async Task GetMyHistory_ReturnsOrderedByCheckInTimeDescending()
    {
        AuthAsMedico();

        // Check-in Alpha, check-out, então check-in Beta (mais recente).
        var ci1 = await PostWithClinic("/api/attendance/check-in", AlphaClinicId, CheckInPayload(AlphaShiftId));
        ci1.StatusCode.Should().Be(HttpStatusCode.Created);
        var co1 = await PostWithClinic("/api/attendance/check-out", AlphaClinicId, new
        {
            shiftId = AlphaShiftId,
            latitude = -23.5505,
            longitude = -46.6333,
            deviceId = "test-device",
        });
        co1.StatusCode.Should().Be(HttpStatusCode.OK);

        var ci2 = await PostWithClinic("/api/attendance/check-in", BetaClinicId, CheckInPayload(BetaShiftId));
        ci2.StatusCode.Should().Be(HttpStatusCode.Created);

        var response = await GetWithClinic("/api/attendance/my-history", AlphaClinicId);
        var history = (await response.Content.ReadFromJsonAsync<List<AttendanceResponse>>())!;

        history.Should().HaveCount(2);
        // Primeiro é o mais recente (Beta), segundo o mais antigo (Alpha).
        history[0].ClinicId.Should().Be(BetaClinicId);
        history[1].ClinicId.Should().Be(AlphaClinicId);
    }

    [Fact]
    public async Task GetMyActive_AfterCheckOut_ReturnsEmpty()
    {
        AuthAsMedico(activeClinicId: AlphaClinicId);

        var checkIn = await _client.PostAsJsonAsync("/api/attendance/check-in", CheckInPayload(AlphaShiftId));
        checkIn.StatusCode.Should().Be(HttpStatusCode.Created);

        var checkOut = await _client.PostAsJsonAsync("/api/attendance/check-out", new
        {
            shiftId = AlphaShiftId,
            latitude = -23.5505,
            longitude = -46.6333,
            deviceId = "test-device",
        });
        checkOut.StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await _client.GetAsync("/api/attendance/active");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var actives = await response.Content.ReadFromJsonAsync<List<AttendanceResponse>>();
        actives.Should().BeEmpty();
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private void AuthAsMedico(Guid? activeClinicId = null)
    {
        var token = GenerateMedicoToken(activeClinicId ?? AlphaClinicId);
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        _client.DefaultRequestHeaders.Remove("X-Clinic-Id");
    }

    private Task<HttpResponseMessage> GetWithClinic(string url, Guid clinicId)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("X-Clinic-Id", clinicId.ToString());
        return _client.SendAsync(request);
    }

    private async Task<HttpResponseMessage> PostWithClinic<T>(string url, Guid clinicId, T body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Add("X-Clinic-Id", clinicId.ToString());
        return await _client.SendAsync(request);
    }

    private static object CheckInPayload(Guid shiftId) => new
    {
        shiftId,
        latitude = -23.5505,
        longitude = -46.6333,
        deviceId = "test-device",
        biometricValidated = true,
    };

    /// <summary>
    /// Gera um token JWT válido pro medico teste, com clinicIds contendo Alpha
    /// e Beta e a clínica ativa no clinicId legado.
    /// </summary>
    private static string GenerateMedicoToken(Guid activeClinicId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSecret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, MedicoUserId.ToString()),
            new(JwtRegisteredClaimNames.Email, "medico@test.com"),
            new("name", "Dr. Médico Teste"),
            new("clinicId", activeClinicId.ToString()),
            new("clinicIds", $"{AlphaClinicId},{BetaClinicId}"),
            new("roles", "Medico"),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
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
        if (db.Users.Any()) return;

        var now = DateTime.UtcNow;
        var today = now.Date;

        var medico = new User
        {
            Id = MedicoUserId,
            Email = "medico@test.com",
            Name = "Dr. Médico Teste",
            // Hash da senha "Teste@123" (mesmo algoritmo do seeder de dev)
            PasswordHash = HashPassword("Teste@123"),
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Users.Add(medico);

        db.Clinics.AddRange(
            new Clinic { Id = AlphaClinicId, Name = "Clínica Alpha", Address = "Rua A", Phone = "1", IsActive = true, CreatedAt = now },
            new Clinic { Id = BetaClinicId,  Name = "Clínica Beta",  Address = "Rua B", Phone = "2", IsActive = true, CreatedAt = now });

        db.UserClinicRoles.AddRange(
            new UserClinicRole { Id = Guid.NewGuid(), UserId = MedicoUserId, ClinicId = AlphaClinicId, Role = RoleType.Medico, AssignedAt = now },
            new UserClinicRole { Id = Guid.NewGuid(), UserId = MedicoUserId, ClinicId = BetaClinicId,  Role = RoleType.Medico, AssignedAt = now });

        db.Shifts.AddRange(
            new Shift { Id = AlphaShiftId, ClinicId = AlphaClinicId, Title = "Plantão Alpha", Date = today, StartTime = TimeSpan.Zero, EndTime = new TimeSpan(23,59,59), CreatedAt = now },
            new Shift { Id = BetaShiftId,  ClinicId = BetaClinicId,  Title = "Plantão Beta",  Date = today, StartTime = TimeSpan.Zero, EndTime = new TimeSpan(23,59,59), CreatedAt = now });

        db.ShiftAssignments.AddRange(
            new ShiftAssignment { Id = Guid.NewGuid(), ShiftId = AlphaShiftId, UserId = MedicoUserId, AssignedAt = now },
            new ShiftAssignment { Id = Guid.NewGuid(), ShiftId = BetaShiftId,  UserId = MedicoUserId, AssignedAt = now });

        db.SaveChanges();
    }

    /// <summary>
    /// Gera o hash da senha usando o mesmo serviço do app (BCrypt-based).
    /// Instancia diretamente pra não depender do DI durante o seed.
    /// </summary>
    private static string HashPassword(string password)
        => new PlantonHub.Infrastructure.Services.PasswordHashService().HashPassword(password);
}
