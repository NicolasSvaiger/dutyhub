using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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

// ----- Configuration -----
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("JwtSettings"));

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
builder.Services.AddScoped<IRefreshTokenRepository, RefreshTokenRepository>();

// ----- Application Services -----
// [DEPRECATED - Sprint 2] AuthService kept for backward compat during migration.
#pragma warning disable CS0618
builder.Services.AddScoped<IAuthService, AuthService>();
#pragma warning restore CS0618
builder.Services.AddScoped<IClinicService, ClinicService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IShiftService, ShiftService>();
builder.Services.AddScoped<IAttendanceService, AttendanceService>();
builder.Services.AddScoped<IAttendanceSyncService, AttendanceSyncService>();
builder.Services.AddScoped<IOfflineEventValidator, OfflineEventValidator>();
builder.Services.AddScoped<IAntiFraudDetector, AntiFraudDetector>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<IOfflineSyncAuditService, PlantonHub.Infrastructure.Services.OfflineSyncAuditService>();

// ----- Infrastructure Services -----
// [DEPRECATED - Sprint 2] Kept for backward compat during migration; suppress obsolete warnings.
#pragma warning disable CS0618
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
#pragma warning restore CS0618
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

// ----- Database Seeder -----
builder.Services.AddScoped<DatabaseSeeder>();

// ----- FluentValidation -----
builder.Services.AddValidatorsFromAssemblyContaining<PlantonHub.Application.Validators.LoginRequestValidator>();

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
});

// ----- CORS -----
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
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

// 2. Swagger (development only)
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

// 4. Authentication & Authorization
app.UseAuthentication();
app.UseMiddleware<TokenBlacklistMiddleware>();
app.UseAuthorization();

// 5. Tenant Middleware (after auth, so claims are available)
app.UseMiddleware<TenantMiddleware>();

// 6. Map Controllers
app.MapControllers();

// 7. Health check endpoint (used by Docker/ECS health checks - no auth required)
app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();

// ----- Run Migrations and Seed (Development) -----
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await dbContext.Database.MigrateAsync();

    var seeder = scope.ServiceProvider.GetRequiredService<DatabaseSeeder>();
    await seeder.SeedAsync();
}

app.Run();

// Make the implicit Program class accessible for WebApplicationFactory in integration tests
public partial class Program { }
