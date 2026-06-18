using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Persistence.Repositories;
using IAW.Vdf.Persistence.Seeding;
using IAW.Vdf.Persistence.Vocabulary;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

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

    /// <summary>
    /// Registers the DB-backed, refreshable vocabulary catalog: the singleton
    /// <see cref="IVocabularyCatalogProvider"/>, the idempotent <see cref="VocabularySeeder"/>, and a
    /// hosted service that seeds-if-empty and primes the cache at startup.
    ///
    /// This does NOT register <see cref="VocabularyCatalog"/> itself — the host decides the lifetime of the
    /// injectable catalog (the API registers it as <c>sp =&gt; provider.Current</c> so every request gets
    /// the live, refreshable catalog). Call this AFTER <see cref="AddVdfPersistence"/>.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddVdfVocabulary(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddScoped<VocabularySeeder>();
        services.AddScoped<VocabularyImpactAnalyzer>();
        services.AddSingleton<IVocabularyCatalogProvider, DbVocabularyCatalogProvider>();
        services.AddHostedService<VocabularySeedHostedService>();

        return services;
    }
}
