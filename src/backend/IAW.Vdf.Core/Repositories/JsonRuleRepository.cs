using IAW.Vdf.Abstractions.Rules;
using IAW.Vdf.Core.Serialization;

namespace IAW.Vdf.Core.Repositories;

/// <summary>
/// An <see cref="IRuleRepository"/> that loads <see cref="RuleDefinition"/> instances from a JSON file
/// (a single rules array) or a directory of <c>*.json</c> files (one or many rules per file). Loaded
/// rules are held in memory; <see cref="SaveAsync"/> updates the in-memory set but does not persist to
/// disk (persistence is a later module's concern).
/// </summary>
public sealed class JsonRuleRepository : IRuleRepository
{
    private readonly InMemoryRuleRepository _backing;

    private JsonRuleRepository(IEnumerable<RuleDefinition> rules) => _backing = new InMemoryRuleRepository(rules);

    /// <summary>Loads rules from a single JSON file containing a rules array.</summary>
    /// <param name="filePath">The file path.</param>
    /// <returns>A new repository.</returns>
    public static JsonRuleRepository FromFile(string filePath)
    {
        var json = File.ReadAllText(filePath);
        return new JsonRuleRepository(RuleSerializer.DeserializeMany(json));
    }

    /// <summary>Loads rules from every <c>*.json</c> file in a directory (each file may hold one rule or an array).</summary>
    /// <param name="directoryPath">The directory path.</param>
    /// <returns>A new repository.</returns>
    public static JsonRuleRepository FromDirectory(string directoryPath)
    {
        var rules = new List<RuleDefinition>();
        foreach (var file in Directory.EnumerateFiles(directoryPath, "*.json", SearchOption.TopDirectoryOnly).OrderBy(f => f, StringComparer.Ordinal))
        {
            var json = File.ReadAllText(file).TrimStart();
            if (json.StartsWith('['))
            {
                rules.AddRange(RuleSerializer.DeserializeMany(json));
            }
            else
            {
                rules.Add(RuleSerializer.Deserialize(json));
            }
        }

        return new JsonRuleRepository(rules);
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<RuleDefinition>> GetActiveRulesAsync(DateTimeOffset asOf, string? ruleSet = null, CancellationToken cancellationToken = default)
        => _backing.GetActiveRulesAsync(asOf, ruleSet, cancellationToken);

    /// <inheritdoc />
    public Task<RuleDefinition?> GetByKeyAsync(string key, CancellationToken cancellationToken = default)
        => _backing.GetByKeyAsync(key, cancellationToken);

    /// <inheritdoc />
    public Task SaveAsync(RuleDefinition rule, CancellationToken cancellationToken = default)
        => _backing.SaveAsync(rule, cancellationToken);
}
