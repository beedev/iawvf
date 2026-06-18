using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Abstractions.Vocabulary;
using IAW.Vdf.Core.Serialization;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.Persistence.Vocabulary;

/// <summary>A rule that references a vocabulary subject path (impact-analysis row).</summary>
/// <param name="Key">The rule's business key (e.g. <c>"PM48"</c>).</param>
/// <param name="Name">The rule's human-readable name.</param>
public readonly record struct ReferencingRule(string Key, string Name);

/// <summary>
/// Determines which ACTIVE rules reference a given vocabulary subject path. A rule references a path when
/// any leaf condition in its <c>AppliesWhen</c> or <c>Assert</c> tree has a <see cref="LeafCondition.Subject"/>
/// equal to that path (trailing <c>[]</c> collection markers are normalized away on both sides). This is the
/// pre-flight check the admin API runs before deprecating or retiring a subject.
/// </summary>
public sealed class VocabularyImpactAnalyzer
{
    private readonly VdfDbContext _db;

    /// <summary>Creates the analyzer over the supplied context.</summary>
    /// <param name="db">The VDF database context.</param>
    public VocabularyImpactAnalyzer(VdfDbContext db)
    {
        ArgumentNullException.ThrowIfNull(db);
        _db = db;
    }

    /// <summary>
    /// Returns the active rules that reference <paramref name="subjectPath"/>, ordered by key.
    /// </summary>
    /// <param name="subjectPath">The subject path to analyze (with or without a trailing <c>[]</c>).</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The distinct referencing rules.</returns>
    public async Task<IReadOnlyList<ReferencingRule>> FindReferencingRulesAsync(
        string subjectPath,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subjectPath);
        var target = VocabularyPathConventions.StripCollectionSuffix(subjectPath);

        // Load active rule versions joined to their identity (key + name). Effective-date windowing is not
        // applied here on purpose: impact analysis considers the currently-live (IsActive) version, which is
        // the surface an author would break by removing a subject.
        var versions = await _db.RuleVersions
            .Include(v => v.Rule)
            .Where(v => v.IsActive && v.Rule != null && v.Rule.Enabled)
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var matches = new List<ReferencingRule>();

        foreach (var version in versions)
        {
            RuleDefinition rule;
            try
            {
                rule = RuleSerializer.Deserialize(version.DefinitionJson);
            }
            catch
            {
                // A malformed stored rule should never crash impact analysis; skip it.
                continue;
            }

            if (ReferencesSubject(rule.AppliesWhen, target) || ReferencesSubject(rule.Assert, target))
            {
                matches.Add(new ReferencingRule(rule.Key, rule.Name));
            }
        }

        return matches
            .OrderBy(m => m.Key, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>Walks a condition tree, returning true if any leaf reads <paramref name="target"/>.</summary>
    private static bool ReferencesSubject(ICondition? condition, string target)
    {
        switch (condition)
        {
            case null:
                return false;

            case LeafCondition leaf:
                return string.Equals(
                    VocabularyPathConventions.StripCollectionSuffix(leaf.Subject),
                    target,
                    StringComparison.Ordinal);

            case GroupCondition group:
                foreach (var child in group.Conditions)
                {
                    if (ReferencesSubject(child, target))
                    {
                        return true;
                    }
                }

                return false;

            default:
                return false;
        }
    }
}
