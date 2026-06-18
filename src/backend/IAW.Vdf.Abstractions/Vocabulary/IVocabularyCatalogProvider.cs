namespace IAW.Vdf.Abstractions.Vocabulary;

/// <summary>
/// Supplies the live <see cref="VocabularyCatalog"/> the engine grounds against. Consumers inject the
/// catalog itself (registered as <c>sp =&gt; provider.Current</c>); admin mutations call
/// <see cref="RefreshAsync"/> to rebuild the cache so subsequent requests observe the change.
///
/// The default (in-memory) host registers <see cref="VocabularyCatalog.Default"/> directly and has no
/// provider; the API host registers a DB-backed provider so objects/properties can be added/deprecated at
/// runtime without a redeploy.
/// </summary>
public interface IVocabularyCatalogProvider
{
    /// <summary>The current cached catalog, built from the active governed subjects plus the closed grammar.</summary>
    VocabularyCatalog Current { get; }

    /// <summary>Rebuilds the cached catalog from the backing store. Call after any admin mutation.</summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>A task that completes when the cache has been refreshed.</returns>
    Task RefreshAsync(CancellationToken cancellationToken = default);
}
