using System.Text;
using System.Text.Json;
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
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
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
// Connection string (H4): the localhost dev fallback is permitted ONLY in Development. In any other
// environment a missing ConnectionStrings:VdfDb is a fail-fast — never silently use hardcoded creds.
var connectionString = builder.Configuration.GetConnectionString("VdfDb")
    ?? (builder.Environment.IsDevelopment()
        ? "Host=localhost;Port=5433;Database=iaw;Username=iaw;Password=iaw"
        : throw new InvalidOperationException(
            "ConnectionStrings:VdfDb is required in non-Development environments."));

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));

// ── JWT signing-key resolution + STARTUP fail-fast ─────────────────────────────────────────────────
// The signing key MUST be present for the token surface to be sound, and a missing key must be a clear
// FAIL-FAST at STARTUP — never a per-request 500 that would also take down anonymous endpoints
// (/health, /swagger, /api/auth/login).
//   • Production / non-Development: Jwt:Key is REQUIRED; absence throws during app build (see below).
//   • Development: a deterministic dev key is supplied if none is configured, so the local dev surface
//     (and Swagger) always works without secrets. The real dev key still lives in
//     appsettings.Development.json and takes precedence when present.
//
// We apply the policy as a PostConfigure on JwtOptions (so it observes the fully-assembled
// configuration, including any late in-memory sources a host injects), and trip the fail-fast once at
// startup by resolving the options right after the host is built — BEFORE any request is served.
// (Policy lives in JwtSigningKeyResolver so it is unit-testable without a full host.)
var isDevelopment = builder.Environment.IsDevelopment();
builder.Services.PostConfigure<JwtOptions>(jwt =>
    jwt.Key = JwtSigningKeyResolver.Resolve(jwt.Key, isDevelopment));

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

        // jwt.Key was resolved by the PostConfigure<JwtOptions> policy (dev fallback or required key),
        // and the startup fail-fast guarantees a non-empty key in any successfully-started host. So this
        // delegate never throws — anonymous endpoints (/health, /swagger, /api/auth/login) never incur a
        // 500 from JWT options binding.
        bearer.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key!)),
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
        // M4: restrict to the methods the UI actually uses rather than allowing any verb.
        .WithMethods("GET", "POST", "OPTIONS")));

// Health checks: liveness + Postgres connectivity.
builder.Services.AddHealthChecks()
    .AddNpgSql(connectionString, name: "postgres");

var app = builder.Build();

// ── STARTUP fail-fast: JWT signing key ──────────────────────────────────────────────────────────────
// Resolve JwtOptions once now, before any request is served. The PostConfigure policy either supplies
// the Development fallback or (in non-Development) throws InvalidOperationException for a missing key —
// surfacing the error at startup rather than as a per-request 500. Reading the options here observes the
// fully-assembled configuration (including any host-injected sources).
_ = app.Services.GetRequiredService<IOptions<JwtOptions>>().Value;

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

// M2: custom response writer that emits only status + per-check name/status — never the exception or
// description, which could disclose internal detail (e.g. connection-string fragments) to anonymous
// callers.
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = static async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var payload = new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
            }),
        };
        await context.Response.WriteAsync(JsonSerializer.Serialize(payload)).ConfigureAwait(false);
    },
}).AllowAnonymous();
app.MapControllers();

app.Run();

/// <summary>
/// Entry point exposed as a public partial class so <c>WebApplicationFactory&lt;Program&gt;</c> can host
/// the API in integration tests.
/// </summary>
public partial class Program { }
