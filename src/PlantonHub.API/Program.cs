using System.Text;
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
builder.Services.AddScoped<IAuthService, AuthService>();
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
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IPasswordHashService, PasswordHashService>();
builder.Services.AddScoped<ITenantService, TenantService>();
builder.Services.AddHttpContextAccessor();

// ----- Redis / Distributed Cache -----
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("Redis");
    options.InstanceName = builder.Configuration["CacheSettings:InstancePrefix"] ?? "plantonhub:";
});

// Also register IConnectionMultiplexer for RemoveByPrefixAsync:
builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
    ConnectionMultiplexer.Connect(builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379"));

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

// ----- Authentication (JWT) -----
var jwtSettings = builder.Configuration.GetSection("JwtSettings").Get<JwtSettings>()!;
var authMode = builder.Configuration["AUTH_MODE"] ?? "local"; // local | cognito | dual

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = "DualAuth";
    options.DefaultChallengeScheme = "DualAuth";
})
.AddJwtBearer("Local", options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidAudience = jwtSettings.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Secret)),
        ClockSkew = TimeSpan.Zero
    };
})
.AddJwtBearer("Cognito", options =>
{
    var cognitoIssuer = builder.Configuration["Cognito__Issuer"]
        ?? "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_0PARyV1xj";
    options.MapInboundClaims = false;
    if (authMode != "local")
    {
        options.Authority = cognitoIssuer;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = cognitoIssuer,
            ValidateAudience = false,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
    }
    else
    {
        // In local mode, don't try to reach Cognito (skip OIDC discovery)
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = false,
            ValidateIssuerSigningKey = false,
            RequireSignedTokens = false,
        };
    }
})
.AddPolicyScheme("DualAuth", "Local or Cognito", options =>
{
    options.ForwardDefaultSelector = context =>
    {
        // If AUTH_MODE is "local", only use local
        if (authMode == "local") return "Local";
        // If AUTH_MODE is "cognito", only use Cognito
        if (authMode == "cognito") return "Cognito";

        // Dual mode: inspect the token to decide
        var authHeader = context.Request.Headers.Authorization.FirstOrDefault();
        if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
            return "Local";

        var token = authHeader["Bearer ".Length..];
        try
        {
            // Cognito tokens have "iss" pointing to cognito-idp URL
            var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
            var jwt = handler.ReadJwtToken(token);
            var issuer = jwt.Issuer;
            if (issuer.Contains("cognito-idp"))
                return "Cognito";
        }
        catch
        {
            // If we can't read the token, fall back to local
        }
        return "Local";
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
        var allowedOrigins = builder.Configuration["Cors__AllowedOrigins"]
            ?? "http://localhost:3000,http://localhost:5173,https://app.laulab.com.br";
        policy.WithOrigins(allowedOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries))
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

// 7. Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }))
   .AllowAnonymous();

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
