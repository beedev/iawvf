using IAW.Vdf.Abstractions.Rules;

namespace IAW.Vdf.Persistence.Entities;

/// <summary>
/// Represents a rule identity row — one row per logical rule key. Versioned rule bodies live in
/// <see cref="RuleVersionEntity"/>. This entity tracks the stable metadata that doesn't change
/// between versions (Key, RuleSet, Phase, etc.).
/// </summary>
public sealed class RuleEntity
{
    /// <summary>The surrogate primary key (uuid).</summary>
    public Guid Id { get; set; }

    /// <summary>The stable business key (e.g. "PM17"). Unique, indexed.</summary>
    public required string RuleKey { get; set; }

    /// <summary>The rule set this rule belongs to (nullable for global rules).</summary>
    public string? RuleSet { get; set; }

    /// <summary>Human-readable rule name.</summary>
    public required string Name { get; set; }

    /// <summary>Optional longer description.</summary>
    public string? Description { get; set; }

    /// <summary>Priority within a phase (lower = runs first).</summary>
    public int Priority { get; set; }

    /// <summary>The execution phase (Derive/Validate/Route).</summary>
    public RulePhase Phase { get; set; }

    /// <summary>Whether the rule is administratively enabled.</summary>
    public bool Enabled { get; set; }

    /// <summary>When this rule identity record was first created.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Navigation: all versions of this rule.</summary>
    public ICollection<RuleVersionEntity> Versions { get; set; } = new List<RuleVersionEntity>();
}
