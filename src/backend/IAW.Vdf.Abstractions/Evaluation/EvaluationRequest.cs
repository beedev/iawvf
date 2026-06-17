using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Triggers;

namespace IAW.Vdf.Abstractions.Evaluation;

/// <summary>The input to a rule-evaluation run.</summary>
public sealed class EvaluationRequest
{
    /// <summary>What initiated the run.</summary>
    public required Trigger Trigger { get; init; }

    /// <summary>The assembled facts to evaluate against.</summary>
    public required FactDocument Facts { get; init; }

    /// <summary>The point in time the evaluation is "as of" (drives effective/expiry windowing).</summary>
    public required DateTimeOffset AsOf { get; init; }

    /// <summary>An optional rule set to restrict evaluation to.</summary>
    public string? RuleSet { get; init; }
}
