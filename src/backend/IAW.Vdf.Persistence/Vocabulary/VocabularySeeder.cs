using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.Persistence.Vocabulary;

/// <summary>
/// Idempotently seeds the <c>vocabulary_subjects</c> table from <see cref="VocabularyCatalog.Default"/> on
/// first run. If the table already contains any rows the seeder is a no-op, so existing governed state is
/// never clobbered. This preserves out-of-the-box behavior: a fresh database starts with exactly the
/// subjects the engine shipped with, all <c>Active</c> and created by <c>"system"</c>.
/// </summary>
public sealed class VocabularySeeder
{
    private readonly VdfDbContext _db;

    /// <summary>Creates the seeder over the supplied context.</summary>
    /// <param name="db">The VDF database context.</param>
    public VocabularySeeder(VdfDbContext db)
    {
        ArgumentNullException.ThrowIfNull(db);
        _db = db;
    }

    /// <summary>
    /// Seeds the vocabulary from <see cref="VocabularyCatalog.Default"/> if the table is empty.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The number of subjects inserted (0 when the table was already populated).</returns>
    public async Task<int> SeedIfEmptyAsync(CancellationToken cancellationToken = default)
    {
        var existing = await _db.VocabularySubjects
            .AnyAsync(cancellationToken)
            .ConfigureAwait(false);

        if (existing)
        {
            return 0;
        }

        var now = DateTimeOffset.UtcNow;
        var rows = VocabularyCatalog.Default().Subjects
            .Select(s => new VocabularySubjectEntity
            {
                Id = Guid.NewGuid(),
                Path = s.Path,
                ObjectName = VocabularyPathConventions.ObjectName(s.Path),
                Label = VocabularyPathConventions.Humanize(VocabularyPathConventions.ObjectName(s.Path)),
                DataType = s.DataType.ToString(),
                Status = VocabularySubjectStatus.Active,
                Version = 1,
                EffectiveDate = now,
                CreatedBy = "system",
                CreatedAt = now,
            })
            .ToList();

        _db.VocabularySubjects.AddRange(rows);
        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return rows.Count;
    }
}

/// <summary>The closed set of vocabulary subject lifecycle statuses.</summary>
public static class VocabularySubjectStatus
{
    /// <summary>Live and offered for new authoring.</summary>
    public const string Active = "Active";

    /// <summary>Still resolvable (live rules keep working) but hidden from new authoring.</summary>
    public const string Deprecated = "Deprecated";
}
