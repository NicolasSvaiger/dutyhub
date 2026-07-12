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
using PlantonHub.Application.Services;
using PlantonHub.Domain.Interfaces;
using PlantonHub.Infrastructure.Cache;
using PlantonHub.Infrastructure.Data;
using PlantonHub.Infrastructure.Repositories;
using PlantonHub.Infrastructure.Seed;
using PlantonHub.Infrastructure.Services;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// ----- Kestrel: suppress Server header + request size limits -----
builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;
    // Limit request body to 1MB — prevents OOM from oversized payloads (e.g., giant embedding arrays)
    options.Limits.MaxRequestBodySize = 1_048_576; // 1 MB
});

// ----- Database -----
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// ----- Repositories -----
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IClinicRepository, ClinicRepository>();
builder.Services.AddScoped<IShiftRepository, ShiftRepository>();
builder.Services.AddScoped<IAttendanceRepository, AttendanceRepository>();
builder.Services.AddScoped<IOfflineAttendanceEventRepository, OfflineAttendanceEventRepository>();
builder.Services.AddScoped<IAuditLogRepository, AuditLogRepository>();
builder.Services.AddScoped<IOfflineSyncAuditLogRepository, OfflineSyncAuditLogRepository>();
builder.Services.AddScoped<IFaceEnrollmentRepository, FaceEnrollmentRepository>();
builder.Services.AddScoped<IDeviceRegistrationRepository, DeviceRegistrationRepository>();

// ----- Application Services -----
builder.Services.AddScoped<IClinicService, ClinicService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IShiftService, ShiftService>();
builder.Services.AddScoped<IAttendanceService, AttendanceService>();
builder.Services.AddScoped<IAttendanceSyncService, AttendanceSyncService>();
builder.Services.AddScoped<IOfflineEventValidator, OfflineEventValidator>();
builder.Services.AddScoped<IFaceVerificationService, FaceVerificationService>();
builder.Services.AddScoped<ICognitoAuthService, CognitoAuthService>();
builder.Services.AddScoped<IAntiFraudDetector, AntiFraudDetector>();
builder.Services.AddScoped<IAuditService, AuditService>();
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
        options.Configuration = config.GetConnectionString("Redis") ?? "localhost:6379,abortConnect=false";
    });

// Also register IConnectionMultiplexer for RemoveByPrefixAsync (reads IConfiguration at runtime):
builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    return ConnectionMultiplexer.Connect(config.GetConnectionString("Redis") ?? "localhost:6379,abortConnect=false");
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

    options.Authority = cognitoIssuer;
    options.MetadataAddress = $"{cognitoIssuer}/.well-known/openid-configuration";

    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = cognitoIssuer,
        ValidateAudience = true,
        ValidAudience = cognitoClientId,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
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

// 6. Map Controllers
app.MapControllers();

// 7. Health check endpoint (used by Docker/ECS health checks - no auth required)
app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();

// ----- Run Migrations (background, non-blocking) -----
// Running MigrateAsync before app.Run() blocks all startup requests for several seconds.
// Instead, run it in a background task so the API is ready to serve health checks immediately.
_ = Task.Run(async () =>
{
    await Task.Delay(500); // brief delay to let the host fully start
    try
    {
        using var scope = app.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await dbContext.Database.MigrateAsync();

        // Seed only in development
        if (app.Environment.IsDevelopment())
        {
            var seeder = scope.ServiceProvider.GetRequiredService<DatabaseSeeder>();
            await seeder.SeedAsync();
        }
    }
    catch (Exception ex)
    {
        var logger = app.Services.GetRequiredService<ILogger<Program>>();
        logger.LogCritical(ex, "Failed to run database migrations on startup");
    }
});

app.Run();

// Make the implicit Program class accessible for WebApplicationFactory in integration tests
public partial class Program { }
