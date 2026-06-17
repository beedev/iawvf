using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.ReferenceData;
using IAW.Vdf.Abstractions.Tracing;

namespace IAW.Vdf.Abstractions.Conditions;

/// <summary>
/// A recursive boolean combinator over child conditions. <see cref="LogicalOperator.All"/> is AND,
/// <see cref="LogicalOperator.Any"/> is OR, and <see cref="LogicalOperator.Not"/> negates its (single) child.
/// </summary>
public sealed class GroupCondition : ICondition
{
    /// <summary>The boolean combinator.</summary>
    public required LogicalOperator LogicalOp { get; init; }

    /// <summary>The child conditions.</summary>
    public IReadOnlyList<ICondition> Conditions { get; init; } = Array.Empty<ICondition>();

    /// <summary>Builds an All (AND) group.</summary>
    /// <param name="conditions">The child conditions.</param>
    /// <returns>A new group condition.</returns>
    public static GroupCondition All(params ICondition[] conditions)
        => new() { LogicalOp = LogicalOperator.All, Conditions = conditions };

    /// <summary>Builds an Any (OR) group.</summary>
    /// <param name="conditions">The child conditions.</param>
    /// <returns>A new group condition.</returns>
    public static GroupCondition Any(params ICondition[] conditions)
        => new() { LogicalOp = LogicalOperator.Any, Conditions = conditions };

    /// <summary>Builds a Not group negating the supplied condition.</summary>
    /// <param name="condition">The child condition to negate.</param>
    /// <returns>A new group condition.</returns>
    public static GroupCondition Not(ICondition condition)
        => new() { LogicalOp = LogicalOperator.Not, Conditions = new[] { condition } };

    /// <inheritdoc />
    public bool Evaluate(FactDocument facts, IReferenceDataProvider references, ConditionTraceSink trace)
    {
        switch (LogicalOp)
        {
            case LogicalOperator.All:
                // Evaluate all children (no short-circuit) so the trace is complete for explainability.
                var allResults = Conditions.Select(c => c.Evaluate(facts, references, trace)).ToList();
                return allResults.All(r => r);

            case LogicalOperator.Any:
                var anyResults = Conditions.Select(c => c.Evaluate(facts, references, trace)).ToList();
                return anyResults.Any(r => r);

            case LogicalOperator.Not:
                if (Conditions.Count != 1)
                {
                    throw new InvalidOperationException("A 'Not' group must contain exactly one child condition.");
                }

                return !Conditions[0].Evaluate(facts, references, trace);

            default:
                return false;
        }
    }
}
