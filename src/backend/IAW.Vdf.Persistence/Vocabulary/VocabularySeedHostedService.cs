using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace IAW.Vdf.Persistence.Vocabulary;

/// <summary>
/// Ensures the governed vocabulary is seeded before the host begins serving requests. On startup it runs
/// the idempotent <see cref="VocabularySeeder"/> (a no-op once the table is populated) and primes the
/// singleton <see cref="DbVocabularyCatalogProvider"/> cache via a refresh, so the very first request
/// observes a fully-populated, DB-backed catalog.
/// </summary>
public sealed class VocabularySeedHostedService : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IAW.Vdf.Abstractions.Vocabulary.IVocabularyCatalogProvider _provider;
    private readonly ILogger<VocabularySeedHostedService> _logger;

    /// <summary>Creates the hosted service.</summary>
    public VocabularySeedHostedService(
        IServiceScopeFactory scopeFactory,
        IAW.Vdf.Abstractions.Vocabulary.IVocabularyCatalogProvider provider,
        ILogger<VocabularySeedHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _provider = provider;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var seeder = scope.ServiceProvider.GetRequiredService<VocabularySeeder>();

        var inserted = await seeder.SeedIfEmptyAsync(cancellationToken).ConfigureAwait(false);
        if (inserted > 0)
        {
            _logger.LogInformation(
                "Vocabulary seeded from defaults: {Count} subjects inserted.", inserted);
        }

        // Prime / rebuild the singleton catalog cache so the first request sees the seeded subjects.
        await _provider.RefreshAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
