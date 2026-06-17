using IAW.Vdf.Abstractions.Conditions;
using IAW.Vdf.Abstractions.Outcomes;

namespace IAW.Vdf.Abstractions.Rules;

/// <summary>The execution phase a rule runs in. Phases run in declaration order so derivations can feed downstream rules.</summary>
public enum RulePhase
{
    /// <summary>Derivation rules; run first to stamp facts that later phases read (rule chaining).</summary>
    Derive,

    /// <summary>Validation rules; produce holds, alerts, warnings.</summary>
    Validate,

    /// <summary>Routing rules; route, escalate, prevent/allow actions.</summary>
    Route,
}

/// <summary>
/// The four-part rule anatomy — WHEN (<see cref="AppliesWhen"/>) + DECISION (<see cref="Assert"/>) +
/// ON SUCCESS (<see cref="OnSuccess"/>) + ON FAILURE (<see cref="OnFailure"/>), with optional
/// <see cref="Recover"/>. Reconciles the VDF specification with the rule-translation reference.
/// </summary>
/// <remarks>
/// Derivation rules (translation-ref example 7, BL3) are a degenerate case: there is no assertion to
/// satisfy, only a value to stamp when applicable. They are modelled by leaving <see cref="Assert"/>
/// <see langword="null"/> (treated as "fails through") and placing a derivation
/// <see cref="Outcome"/> in <see cref="OnFailure"/>, with <see cref="Phase"/> set to
/// <see cref="RulePhase.Derive"/>. When such a rule's <see cref="AppliesWhen"/> holds, the derivation
/// outcome is produced and its target fact is written into the working document for later phases.
/// </remarks>
public sealed class RuleDefinition
{
    /// <summary>The stable business key (e.g. <c>"PM17"</c>).</summary>
    public required string Key { get; init; }

    /// <summary>The human-readable rule name.</summary>
    public required string Name { get; init; }

    /// <summary>An optional longer description.</summary>
    public string? Description { get; init; }

    /// <summary>The rule set this rule belongs to (for partitioned evaluation).</summary>
    public string? RuleSet { get; init; }

    /// <summary>Priority within a phase; lower runs first.</summary>
    public int Priority { get; init; }

    /// <summary>The execution phase.</summary>
    public RulePhase Phase { get; init; } = RulePhase.Validate;

    /// <summary>Whether the rule is active.</summary>
    public bool Enabled { get; init; } = true;

    /// <summary>The rule version (recorded in the trace for auditability).</summary>
    public int Version { get; init; } = 1;

    /// <summary>The date from which the rule is effective (inclusive).</summary>
    public DateTimeOffset EffectiveDate { get; init; } = DateTimeOffset.MinValue;

    /// <summary>The date the rule expires (exclusive); <see langword="null"/> means no expiry.</summary>
    public DateTimeOffset? ExpiryDate { get; init; }

    /// <summary>WHEN: the rule applies only if this is true. <see langword="null"/> means always applies.</summary>
    public ICondition? AppliesWhen { get; init; }

    /// <summary>
    /// DECISION: the condition that must hold for success. <see langword="null"/> is treated as failing
    /// through to <see cref="OnFailure"/> (used by derivation rules).
    /// </summary>
    public ICondition? Assert { get; init; }

    /// <summary>The outcome produced when <see cref="Assert"/> succeeds. Defaults to <see cref="Outcome.Continue"/>.</summary>
    public Outcome OnSuccess { get; init; } = Outcome.Continue();

    /// <summary>An optional recovery strategy attempted before <see cref="OnFailure"/> when the assertion fails.</summary>
    public RecoveryStrategy? Recover { get; init; }

    /// <summary>The outcome produced when <see cref="Assert"/> fails and recovery did not resolve it.</summary>
    public required Outcome OnFailure { get; init; }
}
