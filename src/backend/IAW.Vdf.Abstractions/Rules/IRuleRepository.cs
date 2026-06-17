namespace IAW.Vdf.Abstractions.Rules;

/// <summary>Provides access to stored rule definitions.</summary>
public interface IRuleRepository
{
    /// <summary>Returns rules that are enabled and within their effective/expiry window at the given instant.</summary>
    /// <param name="asOf">The "as of" instant used for effective/expiry windowing.</param>
    /// <param name="ruleSet">An optional rule set filter.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The active rules.</returns>
    Task<IReadOnlyList<RuleDefinition>> GetActiveRulesAsync(DateTimeOffset asOf, string? ruleSet = null, CancellationToken cancellationToken = default);

    /// <summary>Returns a rule by its business key, or <see langword="null"/> if not found.</summary>
    /// <param name="key">The rule key.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The rule, or <see langword="null"/>.</returns>
    Task<RuleDefinition?> GetByKeyAsync(string key, CancellationToken cancellationToken = default);

    /// <summary>Persists a rule (insert or update by key).</summary>
    /// <param name="rule">The rule to save.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>A task representing the operation.</returns>
    Task SaveAsync(RuleDefinition rule, CancellationToken cancellationToken = default);
}
