using System.Text;
using IAW.Vdf.Api.Auth;
using IAW.Vdf.Api.Governance;
using IAW.Vdf.Api.Infrastructure;
using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Authoring.DependencyInjection;
using IAW.Vdf.Authoring.DryRun;
using IAW.Vdf.Authoring.Linting;
using IAW.Vdf.Authoring.Llm.Configuration;
using IAW.Vdf.Authoring.Llm.DependencyInjection;
using IAW.Vdf.Core.DependencyInjection;
using IAW.Vdf.Core.Engine;
using IAW.Vdf.Persistence.DependencyInjection;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

// Load .env from a repo ancestor for local development so OPENAI_* and any connection-string overrides
// are available. Real environment variables and appsettings always win (overrideExisting: false), so
// production configuration is never clobbered by a stray .env.
DotEnv.LoadFromAncestors(overrideExisting: false);

var builder = WebApplication.CreateBuilder(args);

// ── Configuration ──────────────────────────────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("VdfDb")
    ?? "Host=localhost;Port=5433;Database=iaw;Username=iaw;Password=iaw";

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));

// ── VDF domain services ───────────────────────────────────────────────────────────────────────────
// Order matters: core registers in-memory defaults via TryAdd; persistence overrides the repository and
// reference-data provider with the EF/Postgres implementations.
builder.Services.AddVdfCore();
builder.Services.AddVdfPersistence(connectionString);
builder.Services.AddVdfAuthoring();
builder.Services.AddVdfLlmInterpreter(); // live OpenAI; reads OPENAI_* from the environment.

// The default vocabulary catalog (AddVdfCore registers one too, but we register Default() explicitly
// so the catalog is unambiguous for controllers).
builder.Services.AddSingleton(VocabularyCatalog.Default());

// ── Lifetime reconciliation (captive-dependency avoidance) ──────────────────────────────────────────
// AddVdfCore / AddVdfAuthoring register the engine façade and the reference-data-dependent authoring
// services as SINGLETONS (TryAddSingleton). AddVdfPersistence then registers the EF-backed
// IRuleRepository / IReferenceDataProvider as SCOPED (they own a request-scoped DbContext). A singleton
// that captures a scoped service is a captive dependency: it is validated against at container build time
// (ValidateScopes/ValidateOnBuild, on by default in the test host) and, worse, would silently reuse a
// single DbContext across all requests in production.
//
// We therefore remove the leftover singleton descriptors for the three offenders and re-register them as
// SCOPED, so each request gets an engine / linter / previewer bound to that request's EF repositories.
// This is the registration that guarantees the API evaluates against Postgres-stored rules per request —
// never the in-memory defaults. (SchemaValidator and RoundTripParaphraser take no scoped dependencies and
// remain singletons.)
builder.Services.RemoveAll<IRuleEvaluator>();
builder.Services.RemoveAll<VocabularyLinter>();
builder.Services.RemoveAll<DryRunPreviewer>();

builder.Services.AddScoped<IRuleEvaluator>(sp => new VdfEngine(
    sp.GetRequiredService<IAW.Vdf.Abstractions.Rules.IRuleRepository>(),
    sp.GetRequiredService<IAW.Vdf.Abstractions.ReferenceData.IReferenceDataProvider>(),
    sp.GetRequiredService<RuleSelector>(),
    sp.GetRequiredService<IAW.Vdf.Abstractions.Time.IClock>(),
    sp.GetServices<IAW.Vdf.Abstractions.Outcomes.IOutcomeHandler>()));

builder.Services.AddScoped<VocabularyLinter>();
builder.Services.AddScoped<DryRunPreviewer>();

// Governance workflow + JWT token issuance.
builder.Services.AddScoped<RuleGovernanceService>();
builder.Services.AddSingleton<JwtTokenService>();

// ── AuthN / AuthZ (G2) ────────────────────────────────────────────────────────────────────────────
// Validation parameters are configured from the *bound* JwtOptions (resolved from the built service
// provider), not from a synchronous read of builder.Configuration. This is deliberate: the token-issuing
// side (JwtTokenService) also reads IOptions<JwtOptions>, so binding validation to the same source
// guarantees the signing key, issuer, and audience can never diverge — even when a host injects or
// overrides configuration after the builder phase (e.g. WebApplicationFactory's in-memory config, or a
// production secret-store / environment override). A pre-build read of builder.Configuration would miss
// those late sources and silently validate against a stale key.
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();

builder.Services
    .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((bearer, jwtOptionsAccessor) =>
    {
        var jwt = jwtOptionsAccessor.Value;
        if (string.IsNullOrWhiteSpace(jwt.Key))
        {
            // Fail fast rather than start with an unsigned token surface. The dev key lives in
            // appsettings.Development.json; production must supply Jwt:Key via env / secret store.
            throw new InvalidOperationException(
                "No JWT signing key configured (Jwt:Key). Provide one via configuration or environment.");
        }

        bearer.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(VdfPolicies.CanAuthor, p => p.RequireRole(VdfRoles.Author));
    options.AddPolicy(VdfPolicies.CanReview, p => p.RequireRole(VdfRoles.Reviewer));
    options.AddPolicy(VdfPolicies.CanAdminister, p => p.RequireRole(VdfRoles.Admin));
});

// ── ASP.NET Core ─────────────────────────────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "IAW VDF API", Version = "v1" });

    var scheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter the JWT bearer token obtained from /api/auth/login.",
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
    };
    c.AddSecurityDefinition("Bearer", scheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement { [scheme] = Array.Empty<string>() });

    var xmlPath = Path.Combine(AppContext.BaseDirectory, "IAW.Vdf.Api.xml");
    if (File.Exists(xmlPath))
    {
        c.IncludeXmlComments(xmlPath);
    }
});

// CORS for the React UI.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };
const string CorsPolicy = "VdfUi";
builder.Services.AddCors(options =>
    options.AddPolicy(CorsPolicy, p => p
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()));

// Health checks: liveness + Postgres connectivity.
builder.Services.AddHealthChecks()
    .AddNpgSql(connectionString, name: "postgres");

var app = builder.Build();

// ── HTTP pipeline ─────────────────────────────────────────────────────────────────────────────────
// Global exception → RFC7807 ProblemDetails (no stack traces / secrets to clients).
app.UseMiddleware<ProblemDetailsExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors(CorsPolicy);
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health").AllowAnonymous();
app.MapControllers();

app.Run();

/// <summary>
/// Entry point exposed as a public partial class so <c>WebApplicationFactory&lt;Program&gt;</c> can host
/// the API in integration tests.
/// </summary>
public partial class Program { }
