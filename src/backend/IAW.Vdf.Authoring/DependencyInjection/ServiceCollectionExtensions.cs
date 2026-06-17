using IAW.Vdf.Authoring.DryRun;
using IAW.Vdf.Authoring.Linting;
using IAW.Vdf.Authoring.Paraphrase;
using IAW.Vdf.Authoring.Schema;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace IAW.Vdf.Authoring.DependencyInjection;

/// <summary>Extension methods for registering VDF Authoring services with the DI container.</summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers all VDF Authoring services: <see cref="SchemaValidator"/>,
    /// <see cref="VocabularyLinter"/>, <see cref="RoundTripParaphraser"/>, and
    /// <see cref="DryRunPreviewer"/>.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddVdfAuthoring(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.TryAddSingleton<SchemaValidator>();
        services.TryAddSingleton<VocabularyLinter>();
        services.TryAddSingleton<RoundTripParaphraser>();
        services.TryAddSingleton<DryRunPreviewer>();

        return services;
    }
}
