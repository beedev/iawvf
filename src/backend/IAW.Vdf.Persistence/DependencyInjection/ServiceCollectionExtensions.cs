using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Persistence.Repositories;
using IAW.Vdf.Persistence.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IAW.Vdf.Persistence.DependencyInjection;

/// <summary>Dependency-injection registration for the VDF PostgreSQL persistence layer.</summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers <see cref="VdfDbContext"/> (Npgsql), <see cref="EfRuleRepository"/>,
    /// <see cref="EfReferenceDataProvider"/>, <see cref="DecisionTraceStore"/>, and the
    /// <see cref="RulesCorpusImporter"/> seeder.
    ///
    /// The EF-backed repositories are registered as the primary implementations, overriding any
    /// in-memory defaults registered by <c>AddVdfCore()</c>. Call <c>AddVdfCore()</c> first, then
    /// call this method to swap in the Postgres-backed implementations.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="connectionString">The Postgres connection string.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddVdfPersistence(
        this IServiceCollection services,
        string connectionString)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        // Register VdfDbContext with Npgsql.
        services.AddDbContext<VdfDbContext>(options =>
            options.UseNpgsql(connectionString));

        // Register adapters (override TryAdd defaults from AddVdfCore).
        services.AddScoped<EfRuleRepository>();
        services.AddScoped<EfReferenceDataProvider>();
        services.AddScoped<DecisionTraceStore>();
        services.AddScoped<RulesCorpusImporter>();

        // Override the default IRuleRepository + IReferenceDataProvider.
        services.AddScoped<IRuleRepository, EfRuleRepository>();
        services.AddScoped<IReferenceDataProvider, EfReferenceDataProvider>();
        services.AddScoped<IDecisionTraceStore, DecisionTraceStore>();

        return services;
    }
}
