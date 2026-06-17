using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Core.Engine;

namespace IAW.Vdf.Core.Repositories;

/// <summary>A list-backed <see cref="IRuleRepository"/>. Thread-safe for concurrent reads and writes.</summary>
public sealed class InMemoryRuleRepository : IRuleRepository
{
    private readonly Dictionary<string, RuleDefinition> _rules = new(StringComparer.Ordinal);
    private readonly object _gate = new();

    /// <summary>Creates an empty repository.</summary>
    public InMemoryRuleRepository()
    {
    }

    /// <summary>Creates a repository seeded with the supplied rules.</summary>
    /// <param name="rules">The initial rules.</param>
    public InMemoryRuleRepository(IEnumerable<RuleDefinition> rules)
    {
        foreach (var rule in rules)
        {
            _rules[rule.Key] = rule;
        }
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<RuleDefinition>> GetActiveRulesAsync(DateTimeOffset asOf, string? ruleSet = null, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            IReadOnlyList<RuleDefinition> active = _rules.Values
                .Where(r => r.Enabled)
                .Where(r => RuleSelector.IsWithinWindow(r, asOf))
                .Where(r => ruleSet is null || string.Equals(r.RuleSet, ruleSet, StringComparison.Ordinal))
                .ToList();
            return Task.FromResult(active);
        }
    }

    /// <inheritdoc />
    public Task<RuleDefinition?> GetByKeyAsync(string key, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            _rules.TryGetValue(key, out var rule);
            return Task.FromResult(rule);
        }
    }

    /// <inheritdoc />
    public Task SaveAsync(RuleDefinition rule, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(rule);
        lock (_gate)
        {
            _rules[rule.Key] = rule;
        }

        return Task.CompletedTask;
    }
}
