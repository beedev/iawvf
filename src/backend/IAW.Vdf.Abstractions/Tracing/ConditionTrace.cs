using IAW.Vdf.Abstractions.Conditions;

namespace IAW.Vdf.Abstractions.Tracing;

/// <summary>
/// A single leaf-condition evaluation record captured for explainability: which subject was read,
/// the operator applied, the resolved operands, and the boolean result.
/// </summary>
public sealed record ConditionTrace
{
    /// <summary>The subject path that was evaluated (e.g. <c>"document.circledHE"</c>).</summary>
    public required string Subject { get; init; }

    /// <summary>The operator that was applied.</summary>
    public required OperatorKind Operator { get; init; }

    /// <summary>A human-readable rendering of the resolved left (subject) value.</summary>
    public string? ResolvedLeft { get; init; }

    /// <summary>A human-readable rendering of the resolved right (comparand / reference) value.</summary>
    public string? ResolvedRight { get; init; }

    /// <summary>The boolean outcome of the condition.</summary>
    public required bool Result { get; init; }

    /// <summary>The quantifier in effect for this condition.</summary>
    public Quantifier Quantifier { get; init; } = Quantifier.This;
}

/// <summary>
/// A mutable collection sink that condition evaluation appends to. Passed down the condition tree so a
/// full audit trail of every leaf comparison is produced during a single rule evaluation.
/// </summary>
public sealed class ConditionTraceSink
{
    private readonly List<ConditionTrace> _entries = new();

    /// <summary>The condition traces captured so far, in evaluation order.</summary>
    public IReadOnlyList<ConditionTrace> Entries => _entries;

    /// <summary>Records a condition trace entry.</summary>
    /// <param name="trace">The trace to append.</param>
    public void Add(ConditionTrace trace) => _entries.Add(trace);
}
