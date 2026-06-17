namespace IAW.Vdf.Persistence.Entities;

/// <summary>
/// One immutable version of a rule's compiled body. New versions are appended; prior active versions
/// are marked <c>IsActive=false</c> when superseded. The entire <see cref="RuleDefinition"/> (condition
/// tree, outcomes, recovery strategy) is serialized to <see cref="DefinitionJson"/> as JSONB via
/// <c>RuleSerializer</c>, so no relational decomposition of the condition tree is needed.
/// </summary>
public sealed class RuleVersionEntity
{
    /// <summary>Surrogate PK (uuid).</summary>
    public Guid Id { get; set; }

    /// <summary>FK to the parent <see cref="RuleEntity"/>.</summary>
    public Guid RuleId { get; set; }

    /// <summary>Monotonically increasing version number per rule key (starts at 1).</summary>
    public int Version { get; set; }

    /// <summary>The inclusive start of this version's effective window (timestamptz).</summary>
    public DateTimeOffset EffectiveDate { get; set; }

    /// <summary>The exclusive end of this version's effective window. Null = open-ended.</summary>
    public DateTimeOffset? ExpiryDate { get; set; }

    /// <summary>
    /// The full <see cref="IAW.Vdf.Abstractions.Rules.RuleDefinition"/> serialized as JSONB via
    /// <c>RuleSerializer.Serialize</c>. The entire condition tree and outcomes live here.
    /// </summary>
    public required string DefinitionJson { get; set; }

    /// <summary>The original natural-language text that produced this rule (M4 provenance; nullable).</summary>
    public string? AuthorNl { get; set; }

    /// <summary>The interpreter version that authored this rule (M4 provenance; nullable).</summary>
    public string? InterpreterVersion { get; set; }

    /// <summary>Who authored this version.</summary>
    public string AuthoredBy { get; set; } = "system";

    /// <summary>Who approved this version (nullable until approved).</summary>
    public string? ApprovedBy { get; set; }

    /// <summary>When the version was approved (nullable until approved).</summary>
    public DateTimeOffset? ApprovedAt { get; set; }

    /// <summary>
    /// Whether this version is the currently active one for its rule. Only one version per rule
    /// should have <c>IsActive=true</c> at any given time.
    /// </summary>
    public bool IsActive { get; set; }

    /// <summary>Navigation: owning rule identity.</summary>
    public RuleEntity? Rule { get; set; }
}
