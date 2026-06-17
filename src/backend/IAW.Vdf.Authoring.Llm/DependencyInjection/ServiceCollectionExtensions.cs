using IAW.Vdf.Abstractions.Authoring;
using IAW.Vdf.Authoring.Llm.Configuration;
using IAW.Vdf.Authoring.Llm.Interpretation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace IAW.Vdf.Authoring.Llm.DependencyInjection;

/// <summary>
/// DI registration for the M4 rule interpreters. <see cref="AddVdfLlmInterpreter"/> wires the live OpenAI
/// interpreter (with a named <see cref="HttpClient"/> via <c>IHttpClientFactory</c>); <see cref="AddVdfStubInterpreter"/>
/// wires the offline deterministic stub. Both register <see cref="IRuleInterpreter"/>; pick one per host.
/// The live registration requires an <see cref="Abstractions.ReferenceData.IReferenceDataProvider"/> to be
/// registered (used by the validation gate's linter).
/// </summary>
public static class ServiceCollectionExtensions
{
    /// <summary>The name of the typed <see cref="HttpClient"/> used by the OpenAI interpreter.</summary>
    public const string HttpClientName = "IAW.Vdf.OpenAi";

    /// <summary>
    /// Registers the live OpenAI rule interpreter as <see cref="IRuleInterpreter"/>. Binds
    /// <see cref="OpenAiOptions"/> from environment variables (and the supplied delegate), and registers an
    /// <see cref="IHttpClientFactory"/>-managed client. Environment variables are applied last so they win.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configure">An optional delegate to set defaults before environment overrides apply.</param>
    /// <returns>The service collection, for chaining.</returns>
    public static IServiceCollection AddVdfLlmInterpreter(
        this IServiceCollection services,
        Action<OpenAiOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddOptions<OpenAiOptions>()
            .Configure(options =>
            {
                configure?.Invoke(options);
                // Environment variables win over programmatic defaults.
                options.ApplyEnvironmentOverrides();
            });

        services.AddHttpClient(HttpClientName);

        services.AddScoped<IRuleInterpreter>(sp =>
        {
            var factory = sp.GetRequiredService<IHttpClientFactory>();
            var options = sp.GetRequiredService<IOptions<OpenAiOptions>>();
            var references = sp.GetRequiredService<Abstractions.ReferenceData.IReferenceDataProvider>();
            return new OpenAiRuleInterpreter(factory.CreateClient(HttpClientName), options, references);
        });

        return services;
    }

    /// <summary>
    /// Registers the offline deterministic stub interpreter as <see cref="IRuleInterpreter"/>. Requires no
    /// configuration and performs no network I/O.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection, for chaining.</returns>
    public static IServiceCollection AddVdfStubInterpreter(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);
        services.AddSingleton<IRuleInterpreter, StubRuleInterpreter>();
        return services;
    }
}
