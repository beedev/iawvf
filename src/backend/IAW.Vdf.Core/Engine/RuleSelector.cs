using IAW.Vdf.Abstractions.Rules;

namespace IAW.Vdf.Core.Engine;

/// <summary>
/// Filters and orders rules for execution: keeps enabled rules within their effective/expiry window,
/// then orders by phase (Derive → Validate → Route), then ascending priority, then key for a stable,
/// deterministic sequence. <c>AppliesWhen</c> is evaluated by the engine per-fact, not here.
/// </summary>
public sealed class RuleSelector
{
    /// <summary>Selects the rules eligible to execute at <paramref name="asOf"/>, in deterministic order.</summary>
    /// <param name="rules">The candidate rules.</param>
    /// <param name="asOf">The instant used for effective/expiry windowing.</param>
    /// <returns>The ordered, eligible rules.</returns>
    public IReadOnlyList<RuleDefinition> Select(IEnumerable<RuleDefinition> rules, DateTimeOffset asOf)
    {
        return rules
            .Where(r => r.Enabled)
            .Where(r => IsWithinWindow(r, asOf))
            .OrderBy(r => (int)r.Phase)
            .ThenBy(r => r.Priority)
            .ThenBy(r => r.Key, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>Determines whether a rule's effective/expiry window contains the instant.</summary>
    /// <param name="rule">The rule.</param>
    /// <param name="asOf">The instant.</param>
    /// <returns><see langword="true"/> if active at that instant.</returns>
    public static bool IsWithinWindow(RuleDefinition rule, DateTimeOffset asOf)
        => asOf >= rule.EffectiveDate && (rule.ExpiryDate is null || asOf < rule.ExpiryDate.Value);
}
