using IAW.Vdf.Abstractions.Evaluation;
using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Time;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Core.Engine;
using IAW.Vdf.Core.Facts;
using IAW.Vdf.Core.Operators;
using IAW.Vdf.Core.ReferenceData;
using IAW.Vdf.Core.Repositories;
using IAW.Vdf.Core.Time;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace IAW.Vdf.Core.DependencyInjection;

/// <summary>Dependency-injection registration for the VDF core engine.</summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers the engine, evaluator, operator evaluator, rule selector, reconciler, the default
    /// vocabulary catalog, and default (in-memory / system) providers. Default providers are registered
    /// with <c>TryAdd</c> so a host can override any of them before or after calling this method.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddVdfCore(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        // Core engine components.
        services.TryAddSingleton<IOperatorEvaluator, OperatorEvaluator>();
        services.TryAddSingleton<RuleSelector>();
        services.TryAddSingleton<Reconciler>();
        services.TryAddSingleton(VocabularyCatalog.Default());

        // Default providers (host-overridable).
        services.TryAddSingleton<IClock, SystemClock>();
        services.TryAddSingleton<IReferenceDataProvider, InMemoryReferenceDataProvider>();
        services.TryAddSingleton<IRuleRepository, InMemoryRuleRepository>();
        services.TryAddSingleton<IFactProvider>(_ => new PassthroughFactProvider());

        // The evaluator façade.
        services.TryAddSingleton<IRuleEvaluator, VdfEngine>();

        return services;
    }
}
