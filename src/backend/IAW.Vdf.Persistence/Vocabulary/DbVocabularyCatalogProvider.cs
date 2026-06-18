using IAW.Vdf.Abstractions.Vocabulary;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IAW.Vdf.Persistence.Vocabulary;

/// <summary>
/// A singleton <see cref="IVocabularyCatalogProvider"/> that builds the live
/// <see cref="VocabularyCatalog"/> from the governed <c>vocabulary_subjects</c> table.
///
/// Composition: the catalog's SUBJECTS are the <c>Active</c> AND <c>Deprecated</c> rows from the DB —
/// deprecated subjects REMAIN in the runtime catalog so live rules that reference them keep evaluating
/// (the admin list distinguishes status; new authoring uses only active subjects). The OPERATORS,
/// OUTCOMES, and REFERENCES come from <see cref="VocabularyCatalog.Default"/> (the engine's closed grammar
/// plus the reference keys, which are not user-managed in this iteration).
///
/// The provider is a singleton but reads through a request-style DbContext resolved from a fresh DI scope
/// (via <see cref="IServiceScopeFactory"/>), so it never captures a scoped DbContext. The cached catalog is
/// swapped atomically under a lock; <see cref="Current"/> returns the last-built instance and lazily builds
/// on first access if it has not yet been populated.
/// </summary>
public sealed class DbVocabularyCatalogProvider : IVocabularyCatalogProvider
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly object _gate = new();
    private volatile VocabularyCatalog? _cached;

    /// <summary>Creates the provider.</summary>
    /// <param name="scopeFactory">The DI scope factory used to resolve a scoped <see cref="VdfDbContext"/>.</param>
    public DbVocabularyCatalogProvider(IServiceScopeFactory scopeFactory)
    {
        ArgumentNullException.ThrowIfNull(scopeFactory);
        _scopeFactory = scopeFactory;
    }

    /// <inheritdoc />
    public VocabularyCatalog Current
    {
        get
        {
            var cached = _cached;
            if (cached is not null)
            {
                return cached;
            }

            // First access before an explicit refresh: build synchronously once.
            lock (_gate)
            {
                _cached ??= Build();
                return _cached;
            }
        }
    }

    /// <inheritdoc />
    public async Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        var rebuilt = await BuildAsync(cancellationToken).ConfigureAwait(false);
        lock (_gate)
        {
            _cached = rebuilt;
        }
    }

    private VocabularyCatalog Build()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VdfDbContext>();

        var subjects = db.VocabularySubjects
            .AsNoTracking()
            .Select(s => new { s.Path, s.DataType })
            .ToList();

        return Compose(subjects.Select(s => (s.Path, s.DataType)));
    }

    private async Task<VocabularyCatalog> BuildAsync(CancellationToken cancellationToken)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<VdfDbContext>();

        var subjects = await db.VocabularySubjects
            .AsNoTracking()
            .Select(s => new { s.Path, s.DataType })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return Compose(subjects.Select(s => (s.Path, s.DataType)));
    }

    /// <summary>
    /// Builds a catalog from the DB-sourced subjects (path + data type) plus the closed grammar
    /// (operators, outcomes) and reference keys carried over from <see cref="VocabularyCatalog.Default"/>.
    /// </summary>
    private static VocabularyCatalog Compose(IEnumerable<(string Path, string DataType)> subjects)
    {
        var builder = VocabularyCatalog.CreateBuilder();

        foreach (var (path, dataType) in subjects)
        {
            builder.AddSubject(path, ParseDataType(dataType));
        }

        // Operators, outcomes, and references are the closed grammar / non-user-managed keys.
        var defaults = VocabularyCatalog.Default();
        foreach (var op in defaults.Operators)
        {
            builder.AddOperator(op);
        }

        foreach (var outcome in defaults.Outcomes)
        {
            builder.AddOutcome(outcome);
        }

        foreach (var reference in defaults.References)
        {
            builder.AddReference(reference);
        }

        return builder.Build();
    }

    private static SubjectDataType ParseDataType(string dataType) =>
        Enum.TryParse<SubjectDataType>(dataType, ignoreCase: true, out var parsed)
            ? parsed
            : SubjectDataType.String;
}
