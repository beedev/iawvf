using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Core.Serialization;
using IAW.Vdf.Persistence;
using IAW.Vdf.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace IAW.Vdf.Api.Governance;

/// <summary>
/// The outcome of a governance mutation, distinguishing "succeeded", "rule not found", and
/// "no active version" so the controller can map to the correct HTTP status without leaking internals.
/// </summary>
public enum GovernanceStatus
{
    /// <summary>The operation completed and persisted.</summary>
    Succeeded,

    /// <summary>No rule exists for the supplied key.</summary>
    RuleNotFound,

    /// <summary>The rule exists but has no currently-active version to act on.</summary>
    NoActiveVersion,
}

/// <summary>
/// Governance operations that complement <see cref="IRuleRepository"/>: persisting provenance
/// (author NL + interpreter version) on save, approving the active version, adding effective-dated
/// versions, and enable/disable (promote). These act directly on <see cref="VdfDbContext"/> because the
/// persistence repository contract intentionally exposes only read/save; the governance workflow lives
/// in the API layer. All mutations are scoped to a single rule and persisted atomically.
/// </summary>
public sealed class RuleGovernanceService
{
    private readonly VdfDbContext _db;

    /// <summary>Creates the service over the request-scoped database context.</summary>
    /// <param name="db">The VDF database context.</param>
    public RuleGovernanceService(VdfDbContext db) => _db = db;

    /// <summary>
    /// Persists a rule as a new version (insert-or-append by key), stamping authoring provenance and the
    /// authoring principal. Mirrors the versioning contract of the EF repository (new version supersedes a
    /// prior immediately-effective active version) but additionally records <paramref name="authorNl"/>,
    /// <paramref name="interpreterVersion"/>, and <paramref name="authoredBy"/>.
    /// </summary>
    /// <param name="rule">The rule definition to persist.</param>
    /// <param name="authoredBy">The authenticated principal authoring the version.</param>
    /// <param name="authorNl">Optional natural-language source text (M4 provenance).</param>
    /// <param name="interpreterVersion">Optional interpreter version that produced the rule.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The stored version number.</returns>
    public async Task<int> SaveWithProvenanceAsync(
        RuleDefinition rule,
        string authoredBy,
        string? authorNl,
        string? interpreterVersion,
        CancellationToken cancellationToken = default)
    {
        var ruleEntity = await _db.Rules
            .Include(r => r.Versions)
            .FirstOrDefaultAsync(r => r.RuleKey == rule.Key, cancellationToken)
            .ConfigureAwait(false);

        var now = DateTimeOffset.UtcNow;

        if (ruleEntity is null)
        {
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
            ruleEntity.Name = rule.Name;
            ruleEntity.Description = rule.Description;
            ruleEntity.RuleSet = rule.RuleSet;
            ruleEntity.Priority = rule.Priority;
            ruleEntity.Phase = rule.Phase;
            ruleEntity.Enabled = rule.Enabled;
        }

        var nextVersion = (ruleEntity.Versions.Count > 0 ? ruleEntity.Versions.Max(v => v.Version) : 0) + 1;
        var immediatelyEffective = rule.EffectiveDate <= now;

        if (immediatelyEffective)
        {
            foreach (var prior in ruleEntity.Versions.Where(v => v.IsActive))
            {
                prior.IsActive = false;
            }
        }

        var versionEntity = new RuleVersionEntity
        {
            Id = Guid.NewGuid(),
            RuleId = ruleEntity.Id,
            Version = nextVersion,
            EffectiveDate = rule.EffectiveDate,
            ExpiryDate = rule.ExpiryDate,
            DefinitionJson = RuleSerializer.Serialize(rule),
            AuthorNl = authorNl,
            InterpreterVersion = interpreterVersion,
            AuthoredBy = string.IsNullOrWhiteSpace(authoredBy) ? "system" : authoredBy,
            IsActive = immediatelyEffective,
        };

        ruleEntity.Versions.Add(versionEntity);
        _db.RuleVersions.Add(versionEntity);

        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return nextVersion;
    }

    /// <summary>
    /// Marks the currently-active version of a rule approved, stamping the approver and timestamp.
    /// </summary>
    /// <param name="key">The rule business key.</param>
    /// <param name="approver">The approving principal.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The governance status and (on success) the approved version number.</returns>
    public async Task<(GovernanceStatus Status, int? Version)> ApproveActiveVersionAsync(
        string key,
        string approver,
        CancellationToken cancellationToken = default)
    {
        var ruleEntity = await _db.Rules
            .Include(r => r.Versions)
            .FirstOrDefaultAsync(r => r.RuleKey == key, cancellationToken)
            .ConfigureAwait(false);

        if (ruleEntity is null)
        {
            return (GovernanceStatus.RuleNotFound, null);
        }

        var active = ruleEntity.Versions
            .Where(v => v.IsActive)
            .OrderByDescending(v => v.Version)
            .FirstOrDefault();

        if (active is null)
        {
            return (GovernanceStatus.NoActiveVersion, null);
        }

        active.ApprovedBy = approver;
        active.ApprovedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (GovernanceStatus.Succeeded, active.Version);
    }

    /// <summary>
    /// Enables or disables (promotes / retires) a rule by toggling the identity row's <c>Enabled</c> flag.
    /// Disabled rules are excluded from <see cref="IRuleRepository.GetActiveRulesAsync"/>.
    /// </summary>
    /// <param name="key">The rule business key.</param>
    /// <param name="enabled"><see langword="true"/> to enable (promote), <see langword="false"/> to disable.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The governance status.</returns>
    public async Task<GovernanceStatus> SetEnabledAsync(
        string key,
        bool enabled,
        CancellationToken cancellationToken = default)
    {
        var ruleEntity = await _db.Rules
            .FirstOrDefaultAsync(r => r.RuleKey == key, cancellationToken)
            .ConfigureAwait(false);

        if (ruleEntity is null)
        {
            return GovernanceStatus.RuleNotFound;
        }

        ruleEntity.Enabled = enabled;
        await _db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return GovernanceStatus.Succeeded;
    }

    /// <summary>Returns governance metadata for the active version of a rule (for read-back / GET).</summary>
    /// <param name="key">The rule business key.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The active version's metadata, or <see langword="null"/> if the rule/active version is absent.</returns>
    public async Task<RuleVersionEntity?> GetActiveVersionMetadataAsync(
        string key,
        CancellationToken cancellationToken = default)
    {
        return await _db.RuleVersions
            .Include(v => v.Rule)
            .Where(v => v.Rule != null && v.Rule.RuleKey == key && v.IsActive)
            .AsNoTracking()
            .OrderByDescending(v => v.Version)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}
