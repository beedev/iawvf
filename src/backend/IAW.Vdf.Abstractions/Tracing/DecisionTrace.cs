using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Rules;

namespace IAW.Vdf.Abstractions.Tracing;

/// <summary>
/// A complete, explainable record of one rule's evaluation: whether it applied, the assertion result,
/// every leaf condition compared, any recovery attempt, the facts read, and the outcome produced.
/// Required for auditability — every execution records rule version, inputs, result, decision, and timestamp.
/// </summary>
public sealed record DecisionTrace
{
    /// <summary>The rule's business key.</summary>
    public required string RuleKey { get; init; }

    /// <summary>The rule version that executed.</summary>
    public required int Version { get; init; }

    /// <summary>The phase the rule executed in.</summary>
    public required RulePhase Phase { get; init; }

    /// <summary>Whether the rule applied (its <c>AppliesWhen</c> held).</summary>
    public required bool Applied { get; init; }

    /// <summary>The assertion result; <see langword="null"/> when the rule did not apply or had no assertion.</summary>
    public bool? AssertResult { get; init; }

    /// <summary>The leaf condition traces gathered across <c>AppliesWhen</c> and <c>Assert</c>.</summary>
    public IReadOnlyList<ConditionTrace> Conditions { get; init; } = Array.Empty<ConditionTrace>();

    /// <summary>Whether a recovery strategy was attempted.</summary>
    public bool RecoveryAttempted { get; init; }

    /// <summary>Whether the recovery strategy resolved the failure (suppressing <c>OnFailure</c>).</summary>
    public bool RecoveryResolved { get; init; }

    /// <summary>The outcome produced by this rule, if any.</summary>
    public Outcome? Produced { get; init; }

    /// <summary>The fact paths read during evaluation and their rendered values.</summary>
    public IDictionary<string, object?> FactsRead { get; init; } = new Dictionary<string, object?>(StringComparer.Ordinal);

    /// <summary>When the rule was evaluated.</summary>
    public required DateTimeOffset EvaluatedAt { get; init; }
}
