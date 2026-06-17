using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Outcomes;
using IAW.Vdf.Abstractions.Tracing;

namespace IAW.Vdf.Abstractions.Evaluation;

/// <summary>The output of a rule-evaluation run: produced outcomes, full per-rule trace, and the facts after derivation.</summary>
public sealed class EvaluationResult
{
    /// <summary>The outcomes produced across all evaluated rules, in evaluation order.</summary>
    public required IReadOnlyList<Outcome> Outcomes { get; init; }

    /// <summary>The per-rule decision traces, in evaluation order.</summary>
    public required IReadOnlyList<DecisionTrace> Trace { get; init; }

    /// <summary>The facts after the run, including any derived / stamped values.</summary>
    public required FactDocument FactsAfter { get; init; }
}
