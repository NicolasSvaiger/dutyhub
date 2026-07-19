using System.Threading.RateLimiting;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using PlantonHub.API.Extensions;
using PlantonHub.API.Filters;
using PlantonHub.API.Middleware;
using PlantonHub.Application.Interfaces;
using PlantonHub.Application.Reports;
using PlantonHub.Application.Services;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Cache;
using PlantonHub.Infrastructure.Data;
using PlantonHub.Infrastructure.Repositories;
using PlantonHub.Infrastructure.Seed;
using PlantonHub.Infrastructure.Services;
using Serilog;
using Serilog.Events;
using StackExchange.Redis;

// Treat DateTime.Kind=Unspecified as UTC globally for Npgsql (timestamp with time zone columns)
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

var builder = WebApplication.CreateBuilder(args);

// ----- Structured logging (Serilog) -----
// JSON-to-stdout only — no CloudWatch sink. Both App Runner and ECS Fargate
// with the awslogs driver capture stdout and ship it to CloudWatch natively,
// so a dedicated sink would be duplicated infrastructure. Log level is
// environment-aware to keep test output usable.
builder.Host.UseSerilog((context, services, configuration) =>
{
    var env = context.HostingEnvironment;

    var minimumLevel = env.IsEnvironment("Testing")
        ? LogEventLevel.Warning
        : env.IsDevelopment()
            ? LogEventLevel.Debug
            : LogEventLevel.Information;

    configuration
        .MinimumLevel.Is(minimumLevel)
        .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
        .MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", LogEventLevel.Warning)
        .Enrich.FromLogContext()
        .Enrich.WithMachineName()
        .Enrich.WithEnvironmentName()
        .Enrich.WithProperty("Application", "PlantonHub.API");

    // JSON in prod/staging (parsed by CloudWatch Logs Insights); text in dev
    // for humans reading the terminal.
    if (env.IsDevelopment() || env.IsEnvironment("Testing"))
    {
        configuration.WriteTo.Console(
            outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {SourceContext} {Message:lj} {Properties:j}{NewLine}{Exception}");
    }
    else
    {
        configuration.WriteTo.Console(new Serilog.Formatting.Compact.CompactJsonFormatter());
    }
});

// ----- Kestrel: suppress Server header + request size limits -----
builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;
    // Limit request body to 1MB — prevents OOM from oversized payloads (e.g., giant embedding arrays)
    options.Limits.MaxRequestBodySize = 1_048_576; // 1 MB
});

// ----- Database -----
// Connection string resolution: prefer a literal ConnectionStrings__DefaultConnection
// env var when present (docker-compose.yml / local dev set this directly).
// In production (App Runner), that single env var isn't set — instead
// api-stack.ts passes the pieces separately: DB_HOST/DB_PORT/DB_NAME/
// DB_USERNAME as plain env vars, and DB_PASSWORD via App Runner's native
// RuntimeEnvironmentSecrets (masked, resolved from the RDS instance's own
// generated-credentials secret at container start — never a hand-copied
// value that can go stale). We assemble the Npgsql connection string from
// those pieces here so the masking App Runner provides for DB_PASSWORD
// isn't undone by baking it into a single combined env var upstream.
var defaultConnectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrEmpty(defaultConnectionString))
{
    var dbHost = builder.Configuration["DB_HOST"];
    var dbPort = builder.Configuration["DB_PORT"];
    var dbName = builder.Configuration["DB_NAME"];
    var dbUsername = builder.Configuration["DB_USERNAME"];
    var dbPassword = builder.Configuration["DB_PASSWORD"];

    if (!string.IsNullOrEmpty(dbHost) && !string.IsNullOrEmpty(dbPassword))
    {
        defaultConnectionString =
            $"Host={dbHost};Port={dbPort};Database={dbName};Username={dbUsername};Password={dbPassword}";

        // Write the assembled string back into ConnectionStrings:DefaultConnection
        // so every other call site that resolves it from IConfiguration at
        // runtime (the /health/ready Npgsql check below, and any future
        // code doing the same) sees the same value, instead of needing to
        // duplicate this DB_HOST/DB_PASSWORD assembly logic per call site.
        builder.Configuration["ConnectionStrings:DefaultConnection"] = defaultConnectionString;
    }
}

// Interceptor is resolved from the DbContext-scoped service provider so it
// can read the current HttpContext to attribute mutations to the caller.
builder.Services.AddScoped<AuditSaveChangesInterceptor>();
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
    options
        .UseNpgsql(defaultConnectionString)
        .AddInterceptors(sp.GetRequiredService<AuditSaveChangesInterceptor>()));

// ----- Repositories -----
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IClinicRepository, ClinicRepository>();
builder.Services.AddScoped<IShiftRepository, ShiftRepository>();
builder.Services.AddScoped<IAttendanceRepository, AttendanceRepository>();
builder.Services.AddScoped<IOfflineAttendanceEventRepository, OfflineAttendanceEventRepository>();
builder.Services.AddScoped<IAuditLogRepository, AuditLogRepository>();
builder.Services.AddScoped<IOfflineSyncAuditLogRepository, OfflineSyncAuditLogRepository>();
builder.Services.AddScoped<IPublicOrganRepository, PublicOrganRepository>();
builder.Services.AddScoped<IContractRepository, ContractRepository>();
builder.Services.AddScoped<IUserPublicOrganRoleRepository, UserPublicOrganRoleRepository>();
builder.Services.AddScoped<IFaceEnrollmentRepository, FaceEnrollmentRepository>();
builder.Services.AddScoped<IDeviceRegistrationRepository, DeviceRegistrationRepository>();
builder.Services.AddScoped<ISettingsRepository, SettingsRepository>();
builder.Services.AddScoped<ISubstitutionRepository, SubstitutionRepository>();
builder.Services.AddScoped<IJustificationRepository, JustificationRepository>();
builder.Services.AddScoped<IAlertRepository, AlertRepository>();
builder.Services.AddScoped<IAvailabilityRestrictionRepository, AvailabilityRestrictionRepository>();

// ----- Application Services -----
builder.Services.AddScoped<IClinicService, ClinicService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IShiftService, ShiftService>();
builder.Services.AddScoped<IAttendanceService, AttendanceService>();
builder.Services.AddScoped<IAttendanceSyncService, AttendanceSyncService>();
builder.Services.AddScoped<IOfflineEventValidator, OfflineEventValidator>();
builder.Services.AddScoped<IFaceVerificationService, FaceVerificationService>();
builder.Services.AddScoped<IPublicOrganService, PublicOrganService>();
builder.Services.AddScoped<IContractService>(sp => new ContractService(
    sp.GetRequiredService<IContractRepository>(),
    sp.GetRequiredService<IPublicOrganRepository>(),
    sp.GetRequiredService<ITenantService>()
));
builder.Services.AddScoped<ISettingsService, SettingsService>();
builder.Services.AddScoped<ISubstitutionService, SubstitutionService>();
builder.Services.AddScoped<IJustificationService, JustificationService>();
builder.Services.AddScoped<IBillingService, BillingService>();
builder.Services.AddScoped<IAlertService, AlertService>();
builder.Services.AddScoped<IAvailabilityService, AvailabilityService>();
builder.Services.AddScoped<IManagementReportService, ManagementReportService>();
builder.Services.AddScoped<IPrefeituraService, PrefeituraService>();
builder.Services.AddScoped<IGestorService, GestorService>();

// Portal Prefeitura → Exportação PDF/Excel (Sprint 7B.2).
// 9 generators (5 PDF + 4 Excel) registrados como IReportGenerator;
// ReportService seleciona o certo por (Type, Format). QuestPDF em modo
// Community é MIT — obrigatório declarar a licença no startup.
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
builder.Services.AddScoped<IReportGenerator, PlantonHub.Application.Reports.Pdf.KpisPdfGenerator>();
builder.Services.AddScoped<IReportGenerator, PlantonHub.Application.Reports.Pdf.FrequencyPdfGenerator>();
builder.Services.AddScoped<IReportGenerator, PlantonHub.Application.Reports.Pdf.AtrasosPdfGenerator>();
builder.Services.AddScoped<IReportGenerator, PlantonHub.Application.Reports.Pdf.AusenciasPdfGenerator>();
builder.Services.AddScoped<IReportGenerator, PlantonHub.Application.Reports.Pdf.HistoryPdfGenerator>();
builder.Services.AddScoped<IReportGenerator, PlantonHub.Application.Reports.Excel.FrequencyExcelGenerator>();
builder.Services.AddScoped<IReportGenerator, PlantonHub.Application.Reports.Excel.AtrasosExcelGenerator>();
builder.Services.AddScoped<IReportGenerator, PlantonHub.Application.Reports.Excel.AusenciasExcelGenerator>();
builder.Services.AddScoped<IReportGenerator, PlantonHub.Application.Reports.Excel.HistoryExcelGenerator>();
builder.Services.AddScoped<IReportService, ReportService>();

builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<ICognitoAuthService, CognitoAuthService>();
builder.Services.AddScoped<IAntiFraudDetector, AntiFraudDetector>();
builder.Services.AddScoped<IOfflineSyncAuditService, PlantonHub.Infrastructure.Services.OfflineSyncAuditService>();

// ----- Infrastructure Services -----
builder.Services.AddScoped<IPasswordHashService, PasswordHashService>();
builder.Services.AddScoped<ITenantService, TenantService>();
builder.Services.AddHttpContextAccessor();

// ----- Redis / Distributed Cache -----
// Register RedisCache (TryAdd for IDistributedCache)
builder.Services.AddStackExchangeRedisCache(_ => { });
// Configure Redis options from IConfiguration at RUNTIME so WebApplicationFactory.UseSetting works
builder.Services.Configure<Microsoft.Extensions.Caching.StackExchangeRedis.RedisCacheOptions>(options =>
{
    options.InstanceName = ""; // RedisCacheService.PrefixKey already handles prefixing via CacheSettings
});
builder.Services.AddOptions<Microsoft.Extensions.Caching.StackExchangeRedis.RedisCacheOptions>()
    .Configure<IConfiguration>((options, config) =>
    {
        options.Configuration = config.GetConnectionString("Redis") ?? "localhost:6379";
    });

// Also register IConnectionMultiplexer for RemoveByPrefixAsync (reads IConfiguration at runtime):
builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    return ConnectionMultiplexer.Connect(config.GetConnectionString("Redis") ?? "localhost:6379");
});

// ----- Cache Settings -----
builder.Services.Configure<CacheSettings>(builder.Configuration.GetSection("CacheSettings"));

// ----- Anti-Fraud Settings -----
builder.Services.Configure<PlantonHub.Application.DTOs.Attendance.AntiFraudSettings>(
    builder.Configuration.GetSection(PlantonHub.Application.DTOs.Attendance.AntiFraudSettings.SectionName));

// ----- Cache Services -----
builder.Services.AddScoped<ICacheService, RedisCacheService>();
builder.Services.AddScoped<ITokenBlacklistService, RedisTokenBlacklistService>();
builder.Services.AddScoped<IDistributedLockService, RedisDistributedLockService>();
builder.Services.AddScoped<IBiometricProofService, PlantonHub.Infrastructure.Services.RedisBiometricProofService>();

// ----- Database Seeder -----
builder.Services.AddScoped<DatabaseSeeder>();

// ----- Health Checks -----
// /health   → liveness (process alive, always 200).
// /health/ready → readiness: probes Postgres + Redis. Used by ECS/App Runner
//                to gate traffic during rollout and detect degraded pods.
builder.Services.AddHealthChecks()
    .AddNpgSql(
        connectionStringFactory: sp => sp.GetRequiredService<IConfiguration>().GetConnectionString("DefaultConnection")!,
        name: "postgres",
        failureStatus: Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Unhealthy,
        tags: new[] { "ready" })
    .AddRedis(
        connectionStringFactory: sp => sp.GetRequiredService<IConfiguration>().GetConnectionString("Redis") ?? "localhost:6379",
        name: "redis",
        failureStatus: Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Unhealthy,
        tags: new[] { "ready" });

// ----- FluentValidation -----
builder.Services.AddValidatorsFromAssemblyContaining<PlantonHub.Application.Validators.CheckInRequestValidator>();

// ----- Rate Limiting -----
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // face-login: max 5 attempts per minute per IP (anonymous endpoint)
    options.AddPolicy("FaceLogin", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    // check-in: max 10 attempts per minute per user
    options.AddPolicy("CheckIn", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.User?.FindFirst("sub")?.Value
                          ?? context.Connection.RemoteIpAddress?.ToString()
                          ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    // Shared per-user partition key used by the policies below.
    // Falls back to remote IP for endpoints that may be accessed anonymously
    // during the transitional window between token expiry and refresh.
    static string PerUserOrIp(HttpContext context) =>
        context.User?.FindFirst("sub")?.Value
        ?? context.Connection.RemoteIpAddress?.ToString()
        ?? "unknown";

    // Biometric verify: 10/min per user — hot path for check-in flow, but not
    // as sensitive as the anonymous face-login (which is 5/min per IP).
    options.AddPolicy("BiometricVerify", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: PerUserOrIp(context),
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    // Device reset: 3/min per user — sensitive action, low frequency in normal use.
    options.AddPolicy("DeviceReset", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: PerUserOrIp(context),
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 3,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    // Logout: 10/min per user — protects Redis blacklist writes from token flooding.
    options.AddPolicy("Logout", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: PerUserOrIp(context),
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    // Session validation: 60/min per user — used on app launch and periodically
    // by the Flutter client; higher permit but still bounded to catch runaways.
    options.AddPolicy("Session", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: PerUserOrIp(context),
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    // Prefeitura → Acionar OS: 5/min por gestor. Evita spam de alertas
    // contra a OS. Design.md § "Acionar OS" (10.4).
    options.AddPolicy("PrefeituraNotifyOs", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: PerUserOrIp(context),
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    // Prefeitura → Export PDF/Excel: 10/min por gestor. Geração é
    // CPU-bound; limita paralelismo. Design.md § "Exportação" (11.7).
    options.AddPolicy("PrefeituraExport", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: PerUserOrIp(context),
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    // Global fallback: on rejection, add Retry-After header
    options.OnRejected = async (ctx, cancellationToken) =>
    {
        ctx.HttpContext.Response.Headers["Retry-After"] = "60";
        ctx.HttpContext.Response.ContentType = "application/problem+json";
        await ctx.HttpContext.Response.WriteAsJsonAsync(new
        {
            type = "https://tools.ietf.org/html/rfc6585#section-4",
            title = "Too Many Requests",
            status = 429,
            detail = "Limite de requisições excedido. Tente novamente em 60 segundos.",
        }, cancellationToken);
    };
});

// ----- Authentication (Cognito JWT) -----
var cognitoRegion = builder.Configuration["Cognito:Region"] ?? "us-east-1";
var cognitoUserPoolId = builder.Configuration["Cognito:UserPoolId"]!;
var cognitoClientId = builder.Configuration["Cognito:ClientId"]!;
var cognitoIssuer = $"https://cognito-idp.{cognitoRegion}.amazonaws.com/{cognitoUserPoolId}";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.MapInboundClaims = false;

    // We do NOT set Authority/MetadataAddress — that would make the framework
    // fetch JWKS keys from Cognito on every startup, which fails when the
    // App Runner VPC has no egress to the internet. Instead we load the
    // JWKS keys statically from a file baked into the image (config/jwks.json)
    // and cache them for the process lifetime.
    var jwksPath = Path.Combine(AppContext.BaseDirectory, "config", "jwks.json");
    var jwksJson = File.ReadAllText(jwksPath);
    var jwks = new Microsoft.IdentityModel.Tokens.JsonWebKeySet(jwksJson);

    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = cognitoIssuer,
        ValidateAudience = true,
        ValidAudience = cognitoClientId,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        IssuerSigningKeys = jwks.GetSigningKeys(),
        ClockSkew = TimeSpan.FromSeconds(30),
    };

    options.Events = new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents
    {
        OnTokenValidated = context =>
        {
            var claims = context.Principal?.Claims;
            if (claims is null) { context.Fail("No claims"); return Task.CompletedTask; }

            // Accept both access and id tokens from our Cognito User Pool
            var tokenUse = claims.FirstOrDefault(c => c.Type == "token_use")?.Value;
            if (tokenUse is not ("access" or "id")) { context.Fail("Invalid token_use"); return Task.CompletedTask; }

            return Task.CompletedTask;
        }
    };
});

// ----- Authorization Policies -----
builder.Services.AddAuthorizationPolicies();

// ----- Controllers -----
builder.Services.AddControllers(options =>
{
    options.Filters.Add<ETagActionFilter>();
    options.Filters.Add<ValidationActionFilter>();
})
.AddJsonOptions(options =>
{
    // Serialize enums as strings (e.g. "Active" instead of 1)
    options.JsonSerializerOptions.Converters.Add(
        new System.Text.Json.Serialization.JsonStringEnumConverter());
});

// ----- CORS -----
var corsOrigins = builder.Configuration.GetValue<string>("Cors:AllowedOrigins")
    ?? "http://localhost:3000,http://localhost:5173";

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origins = corsOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        // Block wildcard "*" — never allow in any environment
        origins = origins.Where(o => o != "*").ToArray();

        if (origins.Length == 0)
        {
            // Fallback safe: no origins allowed if misconfigured
            origins = new[] { "http://localhost:3000" };
        }

        policy.WithOrigins(origins)
              .AllowAnyMethod()
              .AllowCredentials()
              .WithHeaders("Authorization", "Content-Type", "X-Clinic-Id", "If-None-Match")
              .WithExposedHeaders("Retry-After", "X-Clinic-Id", "ETag");
    });
});

// ----- Swagger/OpenAPI -----
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "PlantonHub API",
        Version = "v1",
        Description = "API para gestão de plantões médicos"
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Insira o token JWT no formato: Bearer {seu_token}"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// ----- Middleware Pipeline -----

// 1. Exception Handling (outermost)
app.UseMiddleware<ExceptionHandlingMiddleware>();

// 2. Security Headers (all responses)
app.UseMiddleware<SecurityHeadersMiddleware>();

// 3. Swagger (development only)
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "PlantonHub API v1");
    });
}

// 3. CORS
app.UseCors();

// 4. Rate Limiting
app.UseRateLimiter();

// 5. Authentication & Authorization
app.UseAuthentication();
app.UseMiddleware<TokenBlacklistMiddleware>();
app.UseAuthorization();

// 5. Tenant Middleware (after auth, so claims are available)
app.UseMiddleware<TenantMiddleware>();

// 6. Structured request logging — one line per HTTP request with method,
//    status, duration, and Serilog properties. Must come before endpoint
//    mapping so it wraps controller execution.
app.UseSerilogRequestLogging(options =>
{
    options.MessageTemplate = "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.0}ms";
});

// 7. Map Controllers
app.MapControllers();

// 8. Health check endpoints (no auth required).
//    /health         → liveness probe: always 200 as long as the process is up.
//    /health/ready   → readiness probe: 503 if Postgres or Redis is unreachable.
app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();

app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var payload = new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                durationMs = e.Value.Duration.TotalMilliseconds,
                error = e.Value.Exception?.Message,
            }),
            totalDurationMs = report.TotalDuration.TotalMilliseconds,
        };
        await context.Response.WriteAsJsonAsync(payload);
    },
}).AllowAnonymous();

// ----- Run Migrations (synchronous, blocking startup) -----
// Migrations run BEFORE app.Run() so the API only starts serving requests
// against a fully-migrated schema. The container will report unhealthy until
// migrations complete — which is the correct semantics: health checks
// (App Runner/ECS) know to wait for /health to succeed before routing traffic.
//
// Integration tests run migrations themselves via WebApplicationFactory, so we
// skip this block in the Testing environment to avoid concurrent MigrateAsync
// calls hitting the same DB (which fails with "column already exists").
if (!app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    try
    {
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await dbContext.Database.MigrateAsync();

        if (app.Environment.IsDevelopment())
        {
            var seeder = scope.ServiceProvider.GetRequiredService<DatabaseSeeder>();
            await seeder.SeedAsync();
        }

        // One-shot opt-in para bootstrapping do gestor publico em ambientes
        // non-dev (staging/prod). Cria APENAS: 1 PublicOrgan fake sem CNPJ +
        // 1 User gestor + 1 UserPublicOrganRole. Nao mexe em admin, medicos,
        // clinicas nem contratos. Idempotente.
        //
        // Fluxo: setar RUN_GESTOR_SEED_ONCE=true no App Runner, disparar
        // deployment, verificar log "Gestor minimo seeded", remover a env
        // var, disparar deployment de novo pra estabilizar.
        var runGestorSeed = string.Equals(
            Environment.GetEnvironmentVariable("RUN_GESTOR_SEED_ONCE"),
            "true",
            StringComparison.OrdinalIgnoreCase);

        if (runGestorSeed && !app.Environment.IsDevelopment())
        {
            var seedLogger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
            seedLogger.LogWarning(
                "RUN_GESTOR_SEED_ONCE=true detected in {Env} — running SeedGestorMinimalAsync.",
                app.Environment.EnvironmentName);

            var seeder = scope.ServiceProvider.GetRequiredService<DatabaseSeeder>();
            await seeder.SeedGestorMinimalAsync();

            seedLogger.LogWarning(
                "Gestor minimo seeded. REMOVE RUN_GESTOR_SEED_ONCE from App Runner env vars now.");
        }
    }
    catch (Exception ex)
    {
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        logger.LogCritical(ex, "Failed to run database migrations on startup");
        throw; // Fail fast — never start serving against an un-migrated schema.
    }
}

app.Run();

// Make the implicit Program class accessible for WebApplicationFactory in integration tests
public partial class Program { }
