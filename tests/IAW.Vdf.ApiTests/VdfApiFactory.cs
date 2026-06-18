using IAW.Vdf.Abstractions.Authoring;
using IAW.Vdf.Authoring.Llm.Interpretation;
using IAW.Vdf.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace IAW.Vdf.ApiTests;

/// <summary>
/// A <see cref="WebApplicationFactory{TEntryPoint}"/> that hosts the real API against the running
/// Postgres but swaps the live OpenAI interpreter for the offline deterministic stub so the test suite
/// performs NO network I/O. A fixed dev JWT signing key is supplied via in-memory configuration so tests
/// can issue tokens through the real <c>/api/auth/login</c> endpoint.
/// </summary>
public sealed class VdfApiFactory : WebApplicationFactory<Program>
{
    /// <summary>The Postgres connection string (the running local Docker instance).</summary>
    public const string ConnectionString =
        "Host=localhost;Port=5433;Database=iaw;Username=iaw;Password=iaw";

    /// <summary>A deterministic, sufficiently-long signing key used only by the test host.</summary>
    private const string TestSigningKey = "test-only-signing-key-must-be-at-least-32-bytes-long-xx";

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:VdfDb"] = ConnectionString,
                ["Jwt:Key"] = TestSigningKey,
                ["Jwt:Issuer"] = "iaw-vdf",
                ["Jwt:Audience"] = "iaw-vdf-clients",
                // Disable the live interpreter so even if env vars are present the stub is authoritative.
                ["OpenAi:Enabled"] = "false",
            });
        });

        builder.ConfigureServices(services =>
        {
            // Replace the live interpreter with the offline deterministic stub (no network in tests).
            services.RemoveAll<IRuleInterpreter>();
            services.AddSingleton<IRuleInterpreter, StubRuleInterpreter>();
        });
    }

    /// <summary>Creates a fresh <see cref="VdfDbContext"/> for test setup / teardown.</summary>
    /// <returns>A new context over the test database.</returns>
    public VdfDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<VdfDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;
        return new VdfDbContext(options);
    }
}
