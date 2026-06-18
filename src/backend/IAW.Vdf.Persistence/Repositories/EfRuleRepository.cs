using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Core.Serialization;
using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.Persistence.Repositories;

/// <summary>
/// An <see cref="IRuleRepository"/> backed by PostgreSQL via EF Core 8.
///
/// Versioning / effective-dating contract:
/// <list type="bullet">
///   <item>Each call to <see cref="SaveAsync"/> appends a new <see cref="RuleVersionEntity"/> (Version++).
///         The prior <c>IsActive</c> version is deactivated when the new version is immediately effective
///         (EffectiveDate &lt;= now). Future-dated versions are saved with <c>IsActive=false</c> and the
///         prior version remains active (IsActive=true) until the future date arrives.</item>
///   <item><see cref="GetActiveRulesAsync"/> performs <em>effective-date windowing</em>: for each
///         enabled rule it selects the highest-version row whose <c>EffectiveDate &lt;= asOf</c> and
///         <c>(ExpiryDate is null OR ExpiryDate &gt; asOf)</c>. This supports time-travel queries (any
///         past or future asOf) regardless of the <c>IsActive</c> denormalized flag.</item>
///   <item><see cref="GetByKeyAsync"/> returns the <c>IsActive=true</c> version (the live current version)
///         as a fast path without an asOf parameter.</item>
/// </list>
/// </summary>
public sealed class EfRuleRepository : IRuleRepository
{
    private readonly VdfDbContext _db;

    /// <summary>Creates the repository over the supplied context.</summary>
    /// <param name="db">The VDF database context.</param>
    public EfRuleRepository(VdfDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task<IReadOnlyList<RuleDefinition>> GetActiveRulesAsync(
        DateTimeOffset asOf,
        string? ruleSet = null,
        CancellationToken cancellationToken = default)
    {
        // Load all rules with their versions, then in-process pick the highest-version
        // row per rule that satisfies the effective-date window.
        // EF parameterizes all values — no raw SQL concatenation.
        var rulesQuery = _db.Rules
            .Where(r => r.Enabled)
            .Include(r => r.Versions)
            .AsNoTracking();

        if (ruleSet is not null)
        {
            rulesQuery = rulesQuery.Where(r => r.RuleSet == ruleSet);
        }

        var rules = await rulesQuery.ToListAsync(cancellationToken).ConfigureAwait(false);

        var result = new List<RuleDefinition>();

        foreach (var rule in rules)
        {
            // For this asOf, find the highest-version version whose effective window contains asOf.
            var activeVersion = rule.Versions
                .Where(v => v.EffectiveDate <= asOf &&
                            (v.ExpiryDate == null || v.ExpiryDate > asOf))
                .OrderByDescending(v => v.Version)
                .FirstOrDefault();

            if (activeVersion is not null)
            {
                result.Add(DeserializeVersion(activeVersion));
            }
        }

        return result.AsReadOnly();
    }

    /// <inheritdoc />
    public async Task<RuleDefinition?> GetByKeyAsync(
        string key,
        CancellationToken cancellationToken = default)
    {
        // Fast path: returns the IsActive=true version (the denormalized "current" flag).
        // Parameterized EF query — key is never string-concatenated into SQL.
        var version = await _db.RuleVersions
            .Include(v => v.Rule)
            .Where(v => v.Rule != null && v.Rule.RuleKey == key && v.IsActive)
            .AsNoTracking()
            .OrderByDescending(v => v.Version)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return version is null ? null : DeserializeVersion(version);
    }

    /// <inheritdoc />
    public async Task SaveAsync(RuleDefinition rule, CancellationToken cancellationToken = default)
    {
        // Locate or create the rule identity row.
        var ruleEntity = await _db.Rules
            .Include(r => r.Versions)
            .FirstOrDefaultAsync(r => r.RuleKey == rule.Key, cancellationToken)
            .ConfigureAwait(false);

        var now = DateTimeOffset.UtcNow;

        if (ruleEntity is null)
        {
            // First save: create the identity row.
            ruleEntity = new RuleEntity
            {
                Id = Guid.NewGuid(),
                RuleKey = rule.Key,
                Name = rule.Name,
                Description = rule.Description,
                RuleSet = rule.RuleSet,
                Priority = rule.Priority,
                Phase = rule.Phase,
                Enabled = rule.Enabled,
                CreatedAt = now,
            };
            _db.Rules.Add(ruleEntity);
        }
        else
        {
            // Update mutable metadata on the identity row.
            ruleEntity.Name = rule.Name;
            ruleEntity.Description = rule.Description;
            ruleEntity.RuleSet = rule.RuleSet;
            ruleEntity.Priority = rule.Priority;
            ruleEntity.Phase = rule.Phase;
            ruleEntity.Enabled = rule.Enabled;
        }

        // Determine the next version number.
        var nextVersion = (ruleEntity.Versions.Count > 0
            ? ruleEntity.Versions.Max(v => v.Version)
            : 0) + 1;

        // Determine if this version is immediately effective.
        var isImmediatelyEffective = rule.EffectiveDate <= now;

        // When the new version is immediately effective, deactivate all prior active versions.
        if (isImmediatelyEffective)
        {
            foreach (var prior in ruleEntity.Versions.Where(v => v.IsActive))
            {
                prior.IsActive = false;
            }
        }

        // The full rule body — including any authored Scope — is persisted in DefinitionJson (jsonb)
        // via the canonical serializer, so scope rides along automatically with no schema migration.
        var definitionJson = RuleSerializer.Serialize(rule);

        var versionEntity = new RuleVersionEntity
        {
            Id = Guid.NewGuid(),
            RuleId = ruleEntity.Id,
            Version = nextVersion,
            EffectiveDate = rule.EffectiveDate,
            ExpiryDate = rule.ExpiryDate,
            DefinitionJson = definitionJson,
            AuthoredBy = "system",
            // Future-effective versions are stored as IsActive=false until they take effect.
            // The IsActive flag is a denormalized "currently live" flag; effective-date
            // windowing in GetActiveRulesAsync handles time-travel queries correctly.
            IsActive = isImmediatelyEffective,
        };

        ruleEntity.Versions.Add(versionEntity);
        _db.RuleVersions.Add(versionEntity);

        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    // --- Helpers ---

    private static RuleDefinition DeserializeVersion(RuleVersionEntity version)
    {
        // Deserialize the full rule body from JSONB.
        var rule = RuleSerializer.Deserialize(version.DefinitionJson);

        // RuleDefinition is a sealed class (not a record), so reconstruct it with DB-authoritative
        // version number and effective dates merged back in.
        return new RuleDefinition
        {
            Key = rule.Key,
            Name = rule.Name,
            Description = rule.Description,
            RuleSet = rule.RuleSet,
            Priority = rule.Priority,
            Phase = rule.Phase,
            Enabled = rule.Enabled,
            Version = version.Version,
            EffectiveDate = version.EffectiveDate,
            ExpiryDate = version.ExpiryDate,
            AppliesWhen = rule.AppliesWhen,
            Assert = rule.Assert,
            OnSuccess = rule.OnSuccess,
            Recover = rule.Recover,
            OnFailure = rule.OnFailure,
            // Preserve the authored scope (governed metadata) across persistence round-trips.
            Scope = rule.Scope,
        };
    }
}
