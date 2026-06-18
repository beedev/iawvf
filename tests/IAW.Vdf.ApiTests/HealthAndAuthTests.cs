using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using IAW.Vdf.Api.Auth;
using IAW.Vdf.Abstractions.Authoring;
using IAW.Vdf.Authoring.Llm.Interpretation;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace IAW.Vdf.ApiTests;

/// <summary>Health, anonymous access, and login/token issuance tests.</summary>
public sealed class HealthAndAuthTests : IClassFixture<VdfApiFactory>
{
    private readonly VdfApiFactory _factory;

    public HealthAndAuthTests(VdfApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Health_ReturnsHealthy()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        // M2: the custom response writer emits a value-suppressed JSON envelope (status + per-check
        // name/status only) — no exception/description that could leak internal detail.
        var body = await response.Content.ReadAsStringAsync();
        using var doc = System.Text.Json.JsonDocument.Parse(body);
        doc.RootElement.GetProperty("status").GetString().Should().Be("Healthy");
        doc.RootElement.GetProperty("checks").EnumerateArray()
            .Should().Contain(c => c.GetProperty("name").GetString() == "postgres");
    }

    [Fact]
    public async Task Login_WithValidDevUser_ReturnsToken()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new { username = "author", password = "author-pw" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<LoginResult>();
        body!.Token.Should().NotBeNullOrWhiteSpace();
        body.Roles.Should().Contain("Author");
    }

    [Fact]
    public async Task Login_WithBadPassword_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new { username = "author", password = "wrong" });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>
    /// Mirrors production: a non-Development host with a JWT signing key supplied via configuration.
    /// The anonymous <c>/health</c> endpoint must return 200 — the JWT bearer options must NOT throw a
    /// per-request 500 just because the host is outside Development. (Regression guard for the hardening
    /// fix that moved the missing-key check to a startup fail-fast.)
    /// </summary>
    [Fact]
    public async Task Health_ReturnsOk_InProduction_WhenJwtKeyConfigured()
    {
        using var factory = new ProductionWithKeyApiFactory();
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        // M2: value-suppressed JSON health envelope (see Health_ReturnsHealthy).
        var body = await response.Content.ReadAsStringAsync();
        using var doc = System.Text.Json.JsonDocument.Parse(body);
        doc.RootElement.GetProperty("status").GetString().Should().Be("Healthy");
    }

    /// <summary>
    /// The startup signing-key guard must FAIL CLEARLY when no key is configured in a non-Development
    /// environment — surfacing a clear startup error rather than a per-request 500. We exercise the
    /// guard policy directly (host startup with a deliberately-broken config is awkward and brittle).
    /// </summary>
    [Fact]
    public void SigningKeyResolver_Throws_WhenKeyMissing_OutsideDevelopment()
    {
        var act = () => JwtSigningKeyResolver.Resolve(configuredKey: null, isDevelopment: false);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*No JWT signing key configured*");
    }

    /// <summary>In Development, a missing key falls back to the deterministic dev key (no throw).</summary>
    [Fact]
    public void SigningKeyResolver_UsesDevFallback_WhenKeyMissing_InDevelopment()
    {
        var resolved = JwtSigningKeyResolver.Resolve(configuredKey: null, isDevelopment: true);

        resolved.Should().Be(JwtSigningKeyResolver.DevelopmentFallbackSigningKey);
    }

    private sealed record LoginResult(string Token, DateTimeOffset ExpiresAt, string[] Roles);

    /// <summary>
    /// A factory that hosts the API in the <c>Production</c> environment with a configured signing key,
    /// swapping the live OpenAI interpreter for the offline stub (no network in tests).
    /// </summary>
    private sealed class ProductionWithKeyApiFactory : WebApplicationFactory<Program>
    {
        private const string ProductionSigningKey =
            "production-style-test-signing-key-at-least-32-bytes-long-xx";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Production");

            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:VdfDb"] = VdfApiFactory.ConnectionString,
                    ["Jwt:Key"] = ProductionSigningKey,
                    ["Jwt:Issuer"] = "iaw-vdf",
                    ["Jwt:Audience"] = "iaw-vdf-clients",
                    ["OpenAi:Enabled"] = "false",
                });
            });

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IRuleInterpreter>();
                services.AddSingleton<IRuleInterpreter, StubRuleInterpreter>();
            });
        }
    }
}
